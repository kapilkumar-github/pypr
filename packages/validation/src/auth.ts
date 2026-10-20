import { z } from 'zod';
import { emailSchema } from './common.js';

export const PASSWORD_MIN_LENGTH = 10;
// Upper bound keeps hashing cost bounded; long passphrases still fit.
export const PASSWORD_MAX_LENGTH = 128;

/** New password. Length is the only rule (NIST SP 800-63B): no forced character classes. */
export const newPasswordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Use at least ${String(PASSWORD_MIN_LENGTH)} characters.`)
  .max(PASSWORD_MAX_LENGTH, `Use at most ${String(PASSWORD_MAX_LENGTH)} characters.`);

export const registerRequestSchema = z.strictObject({
  email: emailSchema,
  password: newPasswordSchema,
});
export type RegisterRequest = z.infer<typeof registerRequestSchema>;

/** Login checks the password, so it accepts any length up to the max: no policy hints. */
export const loginRequestSchema = z.strictObject({
  email: emailSchema,
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const authUserSchema = z.object({
  id: z.uuid(),
  email: z.email(),
});
export type AuthUser = z.infer<typeof authUserSchema>;

/** Body of register, login, refresh and me responses. Tokens travel only in cookies. */
export const authResponseSchema = z.object({ user: authUserSchema });
export type AuthResponse = z.infer<typeof authResponseSchema>;

/** Body of POST /api/auth/verify-email: the token from the emailed link. */
export const verifyEmailRequestSchema = z.strictObject({
  token: z.string().min(16).max(128),
});
export type VerifyEmailRequest = z.infer<typeof verifyEmailRequestSchema>;

/** Body of POST /api/auth/resend-verification. */
export const resendVerificationRequestSchema = z.strictObject({ email: emailSchema });
export type ResendVerificationRequest = z.infer<typeof resendVerificationRequestSchema>;

/** Body of 202 responses (register, resend-verification). */
export const messageResponseSchema = z.object({ message: z.string() });
export type MessageResponse = z.infer<typeof messageResponseSchema>;

/**
 * Machine-readable `code` on auth error responses, for the web app to act on:
 * EMAIL_ALREADY_REGISTERED -> send the user to the login screen,
 * EMAIL_NOT_VERIFIED -> offer to resend the verification link,
 * INVALID_TOKEN -> the emailed link is wrong (or already used), offer a new one,
 * VERIFICATION_LINK_EXPIRED -> the link is too old, offer a new one,
 * EMAIL_ALREADY_VERIFIED -> the link was already used and the email is verified: sign in.
 */
export const AUTH_ERROR_CODES = {
  emailAlreadyRegistered: 'EMAIL_ALREADY_REGISTERED',
  emailNotVerified: 'EMAIL_NOT_VERIFIED',
  invalidToken: 'INVALID_TOKEN',
  verificationLinkExpired: 'VERIFICATION_LINK_EXPIRED',
  emailAlreadyVerified: 'EMAIL_ALREADY_VERIFIED',
} as const;
export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[keyof typeof AUTH_ERROR_CODES];

export const authErrorResponseSchema = z.object({
  statusCode: z.number(),
  message: z.string(),
  code: z.enum(Object.values(AUTH_ERROR_CODES) as [AuthErrorCode, ...AuthErrorCode[]]).optional(),
});
export type AuthErrorResponse = z.infer<typeof authErrorResponseSchema>;
