import { z } from 'zod';

const postgresUrl = z
  .url()
  .refine((value) => /^postgres(ql)?:\/\//.test(value), 'must be a postgres:// URL');

/** Comma-separated list of web origins, e.g. "https://app.pypr.work,http://localhost:3000". */
const originList = z
  .string()
  .transform((value) =>
    value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  )
  .pipe(z.array(z.url({ protocol: /^https?$/ })).min(1, 'must list at least one origin'))
  .transform((urls) => urls.map((url) => new URL(url).origin));

/** Express "trust proxy": true/false, a hop count, or names/subnets like "loopback". */
const trustProxy = z
  .string()
  .min(1)
  .transform((value): boolean | number | string => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return /^\d+$/.test(value) ? Number(value) : value;
  });

const rawEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  /** Address to listen on. 127.0.0.1 keeps the API reachable only through a local proxy/tunnel. */
  HOST: z.string().min(1).default('0.0.0.0'),
  DATABASE_URL: postgresUrl,
  /** HMAC key for access tokens (HS256). At least 32 characters of randomness. */
  JWT_ACCESS_SECRET: z.string().min(32, 'must be at least 32 characters'),
  /** Origins allowed to send requests that change data (decision D4). */
  WEB_ORIGINS: originList.default(['http://localhost:3000']),
  /** Which proxies to trust for the client IP (rate limits). The Next.js dev proxy is loopback. */
  TRUST_PROXY: trustProxy.default('loopback'),
  /** Base URL of the web app, used in links inside emails. */
  APP_URL: z
    .url({ protocol: /^https?$/ })
    .default('http://localhost:3000')
    .transform((url) => new URL(url).origin),
  /** Email adapter (decision D13): "resend" sends for real, "console" logs emails locally. */
  EMAIL_PROVIDER: z.enum(['resend', 'console', 'outbox']).default('console'),
  /** Folder for EMAIL_PROVIDER=outbox (end-to-end tests). */
  EMAIL_OUTBOX_DIR: z.string().min(1).optional(),
  RESEND_API_KEY: z.string().min(1).optional(),
  /** Sender, e.g. "Pypr <no-reply@send.pypr.work>". The domain must be verified in Resend. */
  EMAIL_FROM: z.string().min(3).default('Pypr <no-reply@send.pypr.work>'),
  /** AI resume import (decision D22): "openrouter", or "disabled" to turn import off. */
  RESUME_PARSER_PROVIDER: z.enum(['openrouter', 'disabled']).default('disabled'),
  OPENROUTER_API_KEY: z.string().min(1).optional(),
  /** OpenRouter model id. The default was chosen on 2026-10-20 (see docs/decisions.md D22). */
  OPENROUTER_RESUME_MODEL: z.string().min(3).default('openai/gpt-4.1-mini'),
  RESUME_PARSER_TIMEOUT_MS: z.coerce.number().int().min(5_000).max(180_000).default(60_000),
  /** OpenRouter API base URL; override only for a proxy or a local mock (end-to-end tests). */
  OPENROUTER_BASE_URL: z.url({ protocol: /^https?$/ }).default('https://openrouter.ai/api/v1'),
  /** PDFs rendered at the same time (each uses a headless Chromium page). */
  PDF_CONCURRENCY: z.coerce.number().int().min(1).max(16).default(2),
  /** Give up on a PDF after this long. */
  PDF_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120_000).default(15_000),
});

export type EmailConfig =
  | { provider: 'resend'; resendApiKey: string; from: string }
  | { provider: 'console'; from: string }
  | { provider: 'outbox'; dir: string; from: string };

export type ResumeParserConfig =
  | { provider: 'openrouter'; apiKey: string; model: string; timeoutMs: number; baseUrl: string }
  | { provider: 'disabled' };

export const envSchema = rawEnvSchema
  .superRefine((env, ctx) => {
    if (env.EMAIL_PROVIDER === 'resend' && !env.RESEND_API_KEY) {
      ctx.addIssue({
        code: 'custom',
        path: ['RESEND_API_KEY'],
        message: 'is required when EMAIL_PROVIDER=resend',
      });
    }
    if (env.EMAIL_PROVIDER === 'outbox' && !env.EMAIL_OUTBOX_DIR) {
      ctx.addIssue({
        code: 'custom',
        path: ['EMAIL_OUTBOX_DIR'],
        message: 'is required when EMAIL_PROVIDER=outbox',
      });
    }
    if (env.RESUME_PARSER_PROVIDER === 'openrouter' && !env.OPENROUTER_API_KEY) {
      ctx.addIssue({
        code: 'custom',
        path: ['OPENROUTER_API_KEY'],
        message: 'is required when RESUME_PARSER_PROVIDER=openrouter',
      });
    }
    if (env.NODE_ENV === 'production' && env.EMAIL_PROVIDER !== 'resend') {
      ctx.addIssue({
        code: 'custom',
        path: ['EMAIL_PROVIDER'],
        message: 'must be "resend" in production',
      });
    }
  })
  .transform(
    ({
      EMAIL_PROVIDER,
      RESEND_API_KEY,
      EMAIL_FROM,
      EMAIL_OUTBOX_DIR,
      RESUME_PARSER_PROVIDER,
      OPENROUTER_API_KEY,
      OPENROUTER_RESUME_MODEL,
      RESUME_PARSER_TIMEOUT_MS,
      OPENROUTER_BASE_URL,
      ...rest
    }) => {
      const email: EmailConfig =
        EMAIL_PROVIDER === 'resend'
          ? { provider: 'resend', resendApiKey: RESEND_API_KEY ?? '', from: EMAIL_FROM }
          : EMAIL_PROVIDER === 'outbox'
            ? { provider: 'outbox', dir: EMAIL_OUTBOX_DIR ?? '', from: EMAIL_FROM }
            : { provider: 'console', from: EMAIL_FROM };
      const resumeParser: ResumeParserConfig =
        RESUME_PARSER_PROVIDER === 'openrouter'
          ? {
              provider: 'openrouter',
              apiKey: OPENROUTER_API_KEY ?? '',
              model: OPENROUTER_RESUME_MODEL,
              timeoutMs: RESUME_PARSER_TIMEOUT_MS,
              baseUrl: OPENROUTER_BASE_URL.replace(/\/$/, ''),
            }
          : { provider: 'disabled' };
      return { ...rest, EMAIL: email, RESUME_PARSER: resumeParser };
    },
  );

export type Env = z.infer<typeof envSchema>;

/**
 * Validates process environment at startup so the API fails fast on bad config.
 * Errors name the variable and the problem, never the value (it may be a secret).
 */
export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  - ${issue.path.map(String).join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment variables:\n${problems}`);
  }
  return result.data;
}
