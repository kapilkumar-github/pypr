import { createParamDecorator, UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { getRequestAuth } from './auth-request.js';
import type { AccessClaims } from './tokens.service.js';

/** The signed-in user and session, set by AuthGuard. */
export const CurrentAuth = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AccessClaims => {
    const auth = getRequestAuth(ctx.switchToHttp().getRequest<Request>());
    if (!auth) throw new UnauthorizedException();
    return auth;
  },
);
