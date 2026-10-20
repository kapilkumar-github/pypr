import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AUTH_ERROR_CODES,
  type AuthErrorCode,
  type AuthUser,
  type LoginRequest,
  type RegisterRequest,
} from '@pypr/validation';
import type { Env } from '../config/env.js';
import { PrismaService } from '../database/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { EmailSender } from '../integrations/email/email-sender.js';
import type { IssuedTokens } from './auth-cookies.js';
import {
  EMAIL_VERIFICATION_TTL_HOURS,
  REFRESH_TOKEN_TTL_MS,
  VERIFICATION_RESEND_COOLDOWN_MS,
} from './auth.constants.js';
import { verifyEmailMessage } from './emails/verify-email.email.js';
import { PasswordService } from './password.service.js';
import {
  TokensService,
  hashOpaqueToken,
  hashRefreshToken,
  type AccessClaims,
} from './tokens.service.js';

export interface SessionResult extends IssuedTokens {
  user: AuthUser;
}

interface ClientInfo {
  userAgent: string | null;
}

const INVALID_CREDENTIALS = 'Invalid email or password.';

/** Error with a machine-readable code the web app acts on (see AUTH_ERROR_CODES). */
function authError(status: HttpStatus, code: AuthErrorCode, message: string): HttpException {
  return new HttpException({ statusCode: status, code, message }, status);
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  private readonly appUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokensService,
    private readonly email: EmailSender,
    config: ConfigService<Env, true>,
  ) {
    this.appUrl = config.get('APP_URL', { infer: true });
  }

  /**
   * Creates an unverified account and emails a verification link. Doesn't sign in: that
   * happens when the link is opened. A taken email answers 409 so the web app can send the
   * user to the login screen (accepted enumeration trade-off, decision D12).
   */
  async register(input: RegisterRequest): Promise<void> {
    const existing = await this.prisma.user.findUnique({
      where: { email: input.email },
      select: { id: true },
    });
    if (existing) throw emailTaken();

    const passwordHash = await this.passwords.hash(input.password);
    let user: { id: string; email: string };
    try {
      user = await this.prisma.user.create({ data: { email: input.email, passwordHash } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw emailTaken();
      }
      throw error;
    }

    try {
      await this.sendVerificationEmail(user);
    } catch (error) {
      // Undo, so trying again starts clean instead of hitting "already registered".
      await this.prisma.user.delete({ where: { id: user.id } });
      this.logger.error(`Verification email failed: ${describe(error)}`);
      throw new ServiceUnavailableException(
        "We couldn't send the verification email. Please try again in a moment.",
      );
    }
  }

  async login(input: LoginRequest, client: ClientInfo): Promise<SessionResult> {
    const user = await this.prisma.user.findUnique({ where: { email: input.email } });
    // Always run a verify, so unknown emails and wrong passwords take the same time.
    const valid = await this.passwords.verify(user?.passwordHash ?? null, input.password);
    if (!user || !valid) throw new UnauthorizedException(INVALID_CREDENTIALS);
    // Checked only after the password, so it reveals nothing to someone without it.
    if (!user.emailVerifiedAt) {
      throw authError(
        HttpStatus.FORBIDDEN,
        AUTH_ERROR_CODES.emailNotVerified,
        'Verify your email before signing in. We can send you a new link.',
      );
    }
    return this.startSession(user, client);
  }

  /**
   * Consumes an emailed verification token: marks the email verified, voids the user's other
   * verification links and signs them in.
   */
  async verifyEmail(token: string, client: ClientInfo): Promise<SessionResult> {
    const record = await this.prisma.userToken.findFirst({
      where: { tokenHash: hashOpaqueToken(token), purpose: 'verify_email' },
      include: { user: true },
    });
    const now = new Date();
    if (!record || record.usedAt || record.expiresAt <= now) {
      throw invalidToken();
    }

    const consumed = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.userToken.updateMany({
        where: { id: record.id, usedAt: null },
        data: { usedAt: now },
      });
      if (count === 0) return false;
      await tx.userToken.updateMany({
        where: { userId: record.userId, purpose: 'verify_email', usedAt: null },
        data: { usedAt: now },
      });
      await tx.user.updateMany({
        where: { id: record.userId, emailVerifiedAt: null },
        data: { emailVerifiedAt: now },
      });
      return true;
    });
    if (!consumed) throw invalidToken();

    return this.startSession(record.user, client);
  }

  /**
   * Sends a new verification link if the account exists and still needs one. Always succeeds
   * from the caller's point of view, so it can't be used to probe for accounts.
   */
  async resendVerification(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, emailVerifiedAt: true },
    });
    if (!user || user.emailVerifiedAt) return;

    const recent = await this.prisma.userToken.count({
      where: {
        userId: user.id,
        purpose: 'verify_email',
        createdAt: { gt: new Date(Date.now() - VERIFICATION_RESEND_COOLDOWN_MS) },
      },
    });
    if (recent > 0) return;

    try {
      await this.sendVerificationEmail(user);
    } catch (error) {
      this.logger.error(`Verification email failed: ${describe(error)}`);
    }
  }

  /**
   * Swaps a refresh token for a new pair. Each token works once: presenting one that was
   * already used means it leaked (or a client misbehaved), so the whole session is revoked.
   */
  async refresh(refreshToken: string | undefined): Promise<SessionResult> {
    if (!refreshToken) throw new UnauthorizedException();
    const record = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashRefreshToken(refreshToken) },
      include: { session: { include: { user: true } } },
    });
    if (!record || record.session.revokedAt) throw new UnauthorizedException();
    if (record.usedAt) {
      await this.revokeForReuse(record.sessionId);
      throw new UnauthorizedException();
    }
    const now = new Date();
    if (record.expiresAt <= now) throw new UnauthorizedException();

    const next = this.tokens.createRefreshToken();
    const rotated = await this.prisma.$transaction(async (tx) => {
      // Conditional update: of two concurrent refreshes with one token, only one wins.
      const { count } = await tx.refreshToken.updateMany({
        where: { id: record.id, usedAt: null },
        data: { usedAt: now },
      });
      if (count === 0) return false;
      await tx.refreshToken.create({
        data: { sessionId: record.sessionId, tokenHash: next.hash, expiresAt: refreshExpiry() },
      });
      return true;
    });
    if (!rotated) {
      await this.revokeForReuse(record.sessionId);
      throw new UnauthorizedException();
    }

    const { user } = record.session;
    const accessToken = await this.tokens.signAccessToken({
      userId: user.id,
      sessionId: record.sessionId,
    });
    return { user: toAuthUser(user), accessToken, refreshToken: next.token };
  }

  /** Revokes the session behind either token. Unknown or expired tokens are ignored. */
  async logout(tokens: { refreshToken?: string; accessToken?: string }): Promise<void> {
    let sessionId: string | undefined;
    if (tokens.refreshToken) {
      const record = await this.prisma.refreshToken.findUnique({
        where: { tokenHash: hashRefreshToken(tokens.refreshToken) },
        select: { sessionId: true },
      });
      sessionId = record?.sessionId;
    }
    if (!sessionId && tokens.accessToken) {
      sessionId = (await this.tokens.verifyAccessToken(tokens.accessToken))?.sessionId;
    }
    if (sessionId) await this.revokeSession(sessionId);
  }

  /** Claims of a valid access token whose session is still active. */
  async validateAccessToken(token: string): Promise<AccessClaims | null> {
    const claims = await this.tokens.verifyAccessToken(token);
    if (!claims) return null;
    const session = await this.prisma.session.findUnique({
      where: { id: claims.sessionId },
      select: { userId: true, revokedAt: true },
    });
    if (!session || session.revokedAt || session.userId !== claims.userId) return null;
    return claims;
  }

  async getUser(userId: string): Promise<AuthUser> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    return toAuthUser(user);
  }

  private async sendVerificationEmail(user: { id: string; email: string }): Promise<void> {
    const { token, hash } = this.tokens.createOpaqueToken();
    const created = await this.prisma.userToken.create({
      data: {
        userId: user.id,
        purpose: 'verify_email',
        tokenHash: hash,
        expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TTL_HOURS * 60 * 60 * 1000),
      },
      select: { id: true },
    });
    const link = new URL('/verify-email', this.appUrl);
    link.searchParams.set('token', token);
    await this.email.send({
      to: user.email,
      ...verifyEmailMessage(link.toString(), EMAIL_VERIFICATION_TTL_HOURS),
      idempotencyKey: `verify-email/${created.id}`,
    });
  }

  private async startSession(
    user: { id: string; email: string },
    client: ClientInfo,
  ): Promise<SessionResult> {
    const { token, hash } = this.tokens.createRefreshToken();
    const session = await this.prisma.session.create({
      data: {
        userId: user.id,
        userAgent: client.userAgent,
        refreshTokens: { create: { tokenHash: hash, expiresAt: refreshExpiry() } },
      },
    });
    const accessToken = await this.tokens.signAccessToken({
      userId: user.id,
      sessionId: session.id,
    });
    return { user: toAuthUser(user), accessToken, refreshToken: token };
  }

  private async revokeSession(sessionId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async revokeForReuse(sessionId: string): Promise<void> {
    this.logger.warn(`Refresh token reuse detected; revoking session ${sessionId}`);
    await this.revokeSession(sessionId);
  }
}

function emailTaken(): HttpException {
  return authError(
    HttpStatus.CONFLICT,
    AUTH_ERROR_CODES.emailAlreadyRegistered,
    'An account with this email already exists. Sign in instead.',
  );
}

function invalidToken(): HttpException {
  return authError(
    HttpStatus.BAD_REQUEST,
    AUTH_ERROR_CODES.invalidToken,
    'This verification link is invalid or has expired.',
  );
}

function describe(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : 'unknown error';
}

function refreshExpiry(): Date {
  return new Date(Date.now() + REFRESH_TOKEN_TTL_MS);
}

function toAuthUser(user: { id: string; email: string }): AuthUser {
  return { id: user.id, email: user.email };
}
