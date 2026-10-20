import { Body, Controller, Get, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SkipThrottle, Throttle, ThrottlerGuard } from '@nestjs/throttler';
import {
  loginRequestSchema,
  registerRequestSchema,
  resendVerificationRequestSchema,
  verifyEmailRequestSchema,
  type AuthResponse,
  type LoginRequest,
  type MessageResponse,
  type RegisterRequest,
  type ResendVerificationRequest,
  type VerifyEmailRequest,
} from '@pypr/validation';
import type { Request, Response } from 'express';
import { ZodBodyPipe } from '../common/zod-body.pipe.js';
import type { Env } from '../config/env.js';
import { ACCESS_COOKIE, REFRESH_COOKIE } from './auth.constants.js';
import { clearAuthCookies, setAuthCookies } from './auth-cookies.js';
import { readCookie, userAgentOf } from './auth-request.js';
import { AuthService, type SessionResult } from './auth.service.js';
import { CurrentAuth } from './current-auth.decorator.js';
import { Public } from './public.decorator.js';
import type { AccessClaims } from './tokens.service.js';

@Controller('auth')
@UseGuards(ThrottlerGuard)
export class AuthController {
  private readonly secureCookies: boolean;

  constructor(
    private readonly auth: AuthService,
    config: ConfigService<Env, true>,
  ) {
    this.secureCookies = config.get('NODE_ENV', { infer: true }) !== 'development';
  }

  /** 202: account created, verification email sent. 409 EMAIL_ALREADY_REGISTERED if taken. */
  @Public()
  @Post('register')
  @HttpCode(202)
  async register(
    @Body(new ZodBodyPipe(registerRequestSchema)) body: RegisterRequest,
  ): Promise<MessageResponse> {
    await this.auth.register(body);
    return { message: 'Check your email for a link to verify your account.' };
  }

  /** Opens the emailed link's token: verifies the email and signs in. */
  @Public()
  @Post('verify-email')
  @HttpCode(200)
  async verifyEmail(
    @Body(new ZodBodyPipe(verifyEmailRequestSchema)) body: VerifyEmailRequest,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    return this.respond(
      res,
      await this.auth.verifyEmail(body.token, { userAgent: userAgentOf(req) }),
    );
  }

  /** Always 202, whether or not the account exists or needs verifying. */
  @Public()
  @Post('resend-verification')
  @HttpCode(202)
  async resendVerification(
    @Body(new ZodBodyPipe(resendVerificationRequestSchema)) body: ResendVerificationRequest,
  ): Promise<MessageResponse> {
    await this.auth.resendVerification(body.email);
    return { message: 'If that account still needs verifying, we sent a new link.' };
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(
    @Body(new ZodBodyPipe(loginRequestSchema)) body: LoginRequest,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    return this.respond(res, await this.auth.login(body, { userAgent: userAgentOf(req) }));
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    try {
      return this.respond(res, await this.auth.refresh(readCookie(req, REFRESH_COOKIE)));
    } catch (error) {
      clearAuthCookies(res, this.secureCookies);
      throw error;
    }
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    const refreshToken = readCookie(req, REFRESH_COOKIE);
    const accessToken = readCookie(req, ACCESS_COOKIE);
    await this.auth.logout({
      ...(refreshToken && { refreshToken }),
      ...(accessToken && { accessToken }),
    });
    clearAuthCookies(res, this.secureCookies);
  }

  // Read-only and called on every page load, so it isn't held to the login/register limits.
  @SkipThrottle()
  @Get('me')
  async me(@CurrentAuth() auth: AccessClaims): Promise<AuthResponse> {
    return { user: await this.auth.getUser(auth.userId) };
  }

  private respond(res: Response, result: SessionResult): AuthResponse {
    setAuthCookies(res, result, this.secureCookies);
    return { user: result.user };
  }
}
