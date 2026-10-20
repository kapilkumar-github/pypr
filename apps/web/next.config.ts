import type { NextConfig } from 'next';
import { z } from 'zod';

const envSchema = z.object({
  // Where the NestJS API listens. The browser never calls it directly: requests to
  // /api/* on the web origin are proxied there, so auth cookies stay same-origin.
  API_URL: z.url().default('http://localhost:4000'),
  // Build folder; end-to-end tests build into their own so they don't replace .next.
  NEXT_DIST_DIR: z.string().min(1).default('.next'),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  throw new Error(`Invalid web environment variables:\n${z.prettifyError(parsed.error)}`);
}
const env = parsed.data;
const isDev = process.env.NODE_ENV === 'development';

/**
 * Content Security Policy. Next.js and the theme script need inline scripts ('unsafe-inline'
 * until nonces are added); everything else is same-origin only. The preview iframe uses
 * srcdoc, which inherits this policy, so its inline styles are allowed by style-src.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  `connect-src 'self'${isDev ? ' ws:' : ''}`,
  "frame-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  ...(isDev
    ? []
    : [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' }]),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  distDir: env.NEXT_DIST_DIR,
  headers() {
    return Promise.resolve([{ source: '/:path*', headers: securityHeaders }]);
  },
  rewrites() {
    return Promise.resolve([{ source: '/api/:path*', destination: `${env.API_URL}/api/:path*` }]);
  },
};

export default nextConfig;
