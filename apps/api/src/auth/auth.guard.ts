import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ACCESS_COOKIE } from './auth.constants.js';
import { readCookie, setRequestAuth } from './auth-request.js';
import { AuthService } from './auth.service.js';
import { IS_PUBLIC } from './public.decorator.js';

/** Global guard: every route needs a valid access token unless marked @Public(). */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const token = readCookie(req, ACCESS_COOKIE);
    const claims = token ? await this.auth.validateAccessToken(token) : null;
    if (!claims) throw new UnauthorizedException();
    setRequestAuth(req, claims);
    return true;
  }
}
