import type { Request } from 'express';
import type { AccessClaims } from './tokens.service.js';

// Per-request auth state, kept off the Request type instead of augmenting Express globally.
const authByRequest = new WeakMap<Request, AccessClaims>();

export function setRequestAuth(req: Request, auth: AccessClaims): void {
  authByRequest.set(req, auth);
}

export function getRequestAuth(req: Request): AccessClaims | undefined {
  return authByRequest.get(req);
}

export function readCookie(req: Request, name: string): string | undefined {
  const value: unknown = (req.cookies as Record<string, unknown> | undefined)?.[name];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function userAgentOf(req: Request): string | null {
  return req.get('user-agent')?.slice(0, 512) ?? null;
}
