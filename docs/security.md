# Security review

Review of the code as of milestone 11 (2026-10-20). Each area lists what protects it, how it is
tested, and what is still open. Decisions referenced (D4, D12, …) are in
[decisions.md](decisions.md).

## Summary

No open high-severity issues in the application code. Fixed during the review: unexpected
errors could log request data, the dark theme's subtle text failed contrast, and the web app sent
no security headers. Open items are listed at the end with a suggested priority.

## Authentication and sessions (D4, D9, D12, D14)

| Control                                                                                                  | Where                              | Tested by                                       |
| -------------------------------------------------------------------------------------------------------- | ---------------------------------- | ----------------------------------------------- |
| Passwords hashed with argon2id (19 MiB, t=2, p=1); 10–128 characters                                     | `auth/password.service.ts`         | `password.service.test.ts`                      |
| Same response and timing for unknown email and wrong password (dummy hash)                               | `auth.service.ts` `login`          | `auth.e2e.test.ts`                              |
| Email must be verified before sign-in; checked only after a correct password                             | `auth.service.ts` `login`          | `auth.e2e.test.ts`, `e2e/auth.spec.ts`          |
| Access token: HS256 JWT, 15 min, issuer/audience/algorithm pinned on verify                              | `auth/tokens.service.ts`           | `tokens.service.test.ts` (tampered, expired, …) |
| Access token also checked against the session row, so logout is immediate                                | `auth.guard.ts`                    | `auth.e2e.test.ts` (logout)                     |
| Refresh token: 256-bit random, stored as SHA-256, rotated, single use                                    | `auth.service.ts` `refresh`        | `auth.e2e.test.ts` (rotation, race, expiry)     |
| Reusing a refresh token revokes the whole session                                                        | `auth.service.ts` `revokeForReuse` | `auth.e2e.test.ts`                              |
| Verification links: one-time, 24 h, hash only, older links voided on use                                 | `auth.service.ts` `verifyEmail`    | `auth.e2e.test.ts`                              |
| Cookies `HttpOnly`, `SameSite=Lax`, `Secure` (except local dev); refresh cookie only sent to `/api/auth` | `auth/auth-cookies.ts`             | `auth.e2e.test.ts` (attributes)                 |
| Deny by default: global guard, routes opt out with `@Public()`                                           | `auth.guard.ts`                    | `resumes.e2e.test.ts` (401s)                    |
| Rate limits per client IP: auth 10/min (refresh 30), PDF 20/min                                          | `@nestjs/throttler`                | `auth.e2e.test.ts` (429, per-IP)                |

Accepted trade-offs: register answers 409 for a taken email (account enumeration, D12/D14,
mitigated by rate limits). Opening a verification link signs the user in (proves inbox control,
like a password reset would).

## Cross-site request forgery

- Cookies are `SameSite=Lax`, and every non-GET request must carry an allowed `Origin` header
  (`common/origin-check.ts`, D12). Requests without one are refused.
- The web app proxies `/api` on its own origin (D5), so no CORS is enabled on the API at all.
- Tests: `auth.e2e.test.ts` "Origin check".

## Authorization (resumes)

- Every resume query includes the owner (`where: { id, userId }`); someone else's resume is a
  404, never a 403, so ids can't be probed.
- Saves can't take over rows from other resumes: existing rows are matched only within the
  resume, and new rows are inserted with their client id, so a foreign id fails on the primary
  key and the whole save rolls back.
- Concurrent saves are serialized by a conditional `UPDATE … WHERE revision = ?`; stale
  revisions get 409 (D3).
- Tests: `resumes.e2e.test.ts` "ownership" (get/save/delete/PDF as another user, id takeover).

## Injection and cross-site scripting

- SQL: only Prisma queries and one tagged `$queryRaw` with no input (`SELECT 1`); no string-built
  SQL.
- Request bodies are validated with strict Zod schemas (unknown fields rejected, lengths capped)
  before reaching services. Errors list field paths, never submitted values.
- Resume HTML is rendered by React (`renderToStaticMarkup`), which escapes text. Links go
  through `safeHref`, which only allows `http(s)`, `mailto` and `tel`.
  Tests: `templates/src/render.test.ts`, `view-model.test.ts`.
- The rendered document has its own CSP (`default-src 'none'`) and no scripts.
- The live preview is an iframe with `sandbox="allow-same-origin"` and no `allow-scripts`.

## Server-side request forgery (PDF)

- Chromium runs with JavaScript disabled and every request except `data:` URLs aborted
  (`integrations/pdf/playwright-pdf-renderer.ts`). The HTML comes from our template, not from
  user-supplied markup. Test: `playwright-pdf-renderer.test.ts` "blocks network requests".
- Renders are limited in number (`PDF_CONCURRENCY`) and time (`PDF_TIMEOUT_MS`).

## Resume import and AI (D22)

- Uploads: 5 MB limit, one file, type decided by the file's bytes (not its name or MIME type),
  signed-in users only, Origin check, 5 imports a minute per IP.
- The file is held in request memory only and dropped after the response; it's never written to
  disk, the database or object storage. Logs never contain the file or its text.
- Text goes to OpenRouter only from the server; the key never reaches the browser. Routing is
  restricted to providers that don't retain or train on prompts (`data_collection: deny`).
- The model's output is untrusted: it must match a strict schema, is normalized (fresh ids,
  length limits) and must pass `resumeContentSchema` before the user even sees it, and again when
  the resume is created. The prompt tells the model to treat the resume text as data, which
  limits prompt injection from document content; the worst case is wrong field values, which the
  user reviews.

## Transport and headers

- API: `helmet` defaults (HSTS, nosniff, frame denial, …); `x-powered-by` removed.
- Web: CSP, `X-Frame-Options: DENY`, `frame-ancestors 'none'`, `nosniff`, `Referrer-Policy`,
  `Permissions-Policy`, HSTS outside development (`apps/web/next.config.ts`). The CSP allows
  inline scripts because Next.js and the theme script need them; nonces would remove that.
- The verification page sends no referrer, so its token can't leak to other sites.
- Database: TLS to Supabase without certificate verification for now (D11). **Fix before
  production** (see open items).

## Secrets and logging

- Secrets only in environment variables, validated at startup; validation errors never print
  values. `.env` files are git-ignored; tests ignore `.env` completely.
- Unexpected errors are logged as one safe line; Prisma validation errors, which echo query
  arguments, are reduced to their name (`common/all-exceptions.filter.ts`, fixed in this review).
  Responses to unexpected errors are a generic 500.
- No request-body logging exists. Email adapters never log message bodies, except the console
  adapter, which is refused in production.

## Input limits

JSON bodies are capped at 1 MB; oversized bodies get a 413 JSON error and malformed JSON a 400,
neither with a stack trace (tested in `health.e2e.test.ts`). Resumes are capped at 20 sections,
50 entries per section, 30 list items and per-field lengths.

## Dependencies

`pnpm audit --prod` reports 3 advisories, all in dependencies of the `prisma` CLI
(`mysql2`, `deepmerge-ts`), reached through `@prisma/client`'s optional peer. The CLI is a
development and release tool: it isn't installed in the production image and we don't use MySQL.
Accepted until Prisma updates them. Dependencies are pinned to exact versions at least two weeks
old.

## Accessibility (D8 follow-up)

End-to-end tests run axe (WCAG 2.1 A/AA) on the landing, settings, register, login, dashboard and
editor pages and fail on serious or critical issues. The review found and fixed a contrast
failure in the dark theme.

## Open items

| Priority | Item                                                                                       |
| -------- | ------------------------------------------------------------------------------------------ |
| High     | Verify Supabase's certificate: add its CA and use `sslmode=verify-full` (D11)              |
| Medium   | Move rate-limit counters to a shared store before running more than one API instance (D12) |
| Medium   | Per-account lockout or slow-down after repeated failed logins                              |
| Medium   | Scheduled cleanup of expired refresh tokens, used verification tokens and revoked sessions |
| Low      | CSP nonces in the web app to drop `'unsafe-inline'` for scripts                            |
| Low      | Password reset flow (the `user_tokens` table is ready for it)                              |
| Low      | Session list with "sign out other devices"                                                 |
