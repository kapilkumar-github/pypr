import { AUTH_ERROR_CODES } from '@pypr/validation';
import { ApiError } from './api';

/** What opening a verification link led to, as the verify page shows it. */
export type Outcome = 'verified' | 'already-verified' | 'expired' | 'invalid' | 'retry';

/** What a failed verification means for the page. */
export function classifyVerifyError(error: unknown): Outcome {
  if (!(error instanceof ApiError)) return 'retry';
  if (error.code === AUTH_ERROR_CODES.emailAlreadyVerified) return 'already-verified';
  if (error.code === AUTH_ERROR_CODES.verificationLinkExpired) return 'expired';
  // Network failure, rate limit or server error: the link may still be good.
  if (error.status === 0 || error.status === 429 || error.status >= 500) return 'retry';
  return 'invalid';
}
