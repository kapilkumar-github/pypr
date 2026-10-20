import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SignJWT, jwtVerify } from 'jose';
import { z } from 'zod';
import type { Env } from '../config/env.js';
import { ACCESS_TOKEN_TTL_SECONDS, JWT_AUDIENCE, JWT_ISSUER } from './auth.constants.js';

export interface AccessClaims {
  userId: string;
  sessionId: string;
}

const claimsSchema = z.object({ sub: z.uuid(), sid: z.uuid() });

/** Refresh and one-time tokens are stored only as this hash (decision D4). */
export function hashOpaqueToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export const hashRefreshToken = hashOpaqueToken;

@Injectable()
export class TokensService {
  private readonly key: Uint8Array;

  constructor(config: ConfigService<Env, true>) {
    this.key = new TextEncoder().encode(config.get('JWT_ACCESS_SECRET', { infer: true }));
  }

  /** Short-lived JWT holding only the user id and session id. */
  signAccessToken({ userId, sessionId }: AccessClaims): Promise<string> {
    return new SignJWT({ sid: sessionId })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(userId)
      .setIssuer(JWT_ISSUER)
      .setAudience(JWT_AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(`${String(ACCESS_TOKEN_TTL_SECONDS)}s`)
      .sign(this.key);
  }

  /** Claims of a valid, unexpired token from this API; null for anything else. */
  async verifyAccessToken(token: string): Promise<AccessClaims | null> {
    try {
      const { payload } = await jwtVerify(token, this.key, {
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
        algorithms: ['HS256'],
      });
      const claims = claimsSchema.safeParse(payload);
      return claims.success ? { userId: claims.data.sub, sessionId: claims.data.sid } : null;
    } catch {
      return null;
    }
  }

  /**
   * 256 random bits, base64url: refresh tokens and emailed one-time tokens. Returns the token
   * for the client and its SHA-256 hash, the only form that is stored.
   */
  createOpaqueToken(): { token: string; hash: string } {
    const token = randomBytes(32).toString('base64url');
    return { token, hash: hashOpaqueToken(token) };
  }

  createRefreshToken(): { token: string; hash: string } {
    return this.createOpaqueToken();
  }
}
