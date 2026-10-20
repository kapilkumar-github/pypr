import type { CookieOptions, Response } from 'express';
import {
  ACCESS_COOKIE,
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_COOKIE,
  REFRESH_COOKIE_PATH,
  REFRESH_TOKEN_TTL_MS,
} from './auth.constants.js';

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
}

/** HttpOnly + SameSite=Lax always; Secure everywhere except local development over http. */
function baseOptions(secure: boolean): CookieOptions {
  return { httpOnly: true, sameSite: 'lax', secure };
}

export function setAuthCookies(res: Response, tokens: IssuedTokens, secure: boolean): void {
  res.cookie(ACCESS_COOKIE, tokens.accessToken, {
    ...baseOptions(secure),
    path: '/',
    maxAge: ACCESS_TOKEN_TTL_SECONDS * 1000,
  });
  res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
    ...baseOptions(secure),
    path: REFRESH_COOKIE_PATH,
    maxAge: REFRESH_TOKEN_TTL_MS,
  });
}

export function clearAuthCookies(res: Response, secure: boolean): void {
  res.clearCookie(ACCESS_COOKIE, { ...baseOptions(secure), path: '/' });
  res.clearCookie(REFRESH_COOKIE, { ...baseOptions(secure), path: REFRESH_COOKIE_PATH });
}
