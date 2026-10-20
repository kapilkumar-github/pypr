import { describe, expect, it } from 'vitest';
import { ApiError } from './api';
import { classifyVerifyError } from './verify-outcome';

const apiError = (status: number, code?: string) => new ApiError(status, 'x', code, null);

describe('classifyVerifyError', () => {
  it('maps the API codes to what the page shows', () => {
    expect(classifyVerifyError(apiError(409, 'EMAIL_ALREADY_VERIFIED'))).toBe('already-verified');
    expect(classifyVerifyError(apiError(400, 'VERIFICATION_LINK_EXPIRED'))).toBe('expired');
    expect(classifyVerifyError(apiError(400, 'INVALID_TOKEN'))).toBe('invalid');
    expect(classifyVerifyError(apiError(400))).toBe('invalid'); // malformed token
  });

  it('offers a retry for network, rate-limit and server failures', () => {
    expect(classifyVerifyError(apiError(0))).toBe('retry');
    expect(classifyVerifyError(apiError(429))).toBe('retry');
    expect(classifyVerifyError(apiError(503))).toBe('retry');
    expect(classifyVerifyError(new TypeError('boom'))).toBe('retry');
  });
});
