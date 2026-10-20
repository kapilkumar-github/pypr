/** Access token lifetime (decision D4). */
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
/** Refresh token lifetime; each refresh issues a new token with a fresh lifetime. */
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export const ACCESS_COOKIE = 'pypr_at';
export const REFRESH_COOKIE = 'pypr_rt';
/** The refresh cookie is only sent to auth routes. */
export const REFRESH_COOKIE_PATH = '/api/auth';

export const JWT_ISSUER = 'pypr-api';
export const JWT_AUDIENCE = 'pypr-web';

/** How long an emailed verification link works. */
export const EMAIL_VERIFICATION_TTL_HOURS = 24;
/** Minimum gap between two verification emails to the same account. */
export const VERIFICATION_RESEND_COOLDOWN_MS = 60 * 1000;
