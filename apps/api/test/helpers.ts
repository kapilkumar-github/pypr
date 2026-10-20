import { randomUUID } from 'node:crypto';
import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request, { type Response } from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import { EmailSender } from '../src/integrations/email/email-sender.js';
import { PdfRenderer } from '../src/integrations/pdf/pdf-renderer.js';
import { ResumeParser } from '../src/integrations/resume-parser/resume-parser.js';
import { FakePdfRenderer } from './support/fake-pdf-renderer.js';
import { FakeResumeParser } from './support/fake-resume-parser.js';
import { InMemoryEmailSender } from './support/in-memory-email-sender.js';

/** Matches the default WEB_ORIGINS, so data-changing requests pass the Origin check. */
export const ORIGIN = 'http://localhost:3000';

export async function createTestApp(
  customize: (builder: TestingModuleBuilder) => TestingModuleBuilder = (builder) => builder,
): Promise<NestExpressApplication> {
  // Emails go to an in-memory outbox; read it with outboxOf(app).
  const base = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(EmailSender)
    .useValue(new InMemoryEmailSender())
    .overrideProvider(PdfRenderer)
    .useValue(new FakePdfRenderer())
    .overrideProvider(ResumeParser)
    .useValue(new FakeResumeParser());
  const moduleRef = await customize(base).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ logger: false });
  configureApp(app);
  await app.init();
  return app;
}

export function outboxOf(app: NestExpressApplication): InMemoryEmailSender {
  const sender = app.get(EmailSender);
  if (!(sender instanceof InMemoryEmailSender)) {
    throw new Error('Test app is not using the in-memory email adapter');
  }
  return sender;
}

export function pdfRendererOf(app: NestExpressApplication): FakePdfRenderer {
  const renderer = app.get(PdfRenderer);
  if (!(renderer instanceof FakePdfRenderer))
    throw new Error('Test app is not using the fake PDF adapter');
  return renderer;
}

export function resumeParserOf(app: NestExpressApplication): FakeResumeParser {
  const parser = app.get(ResumeParser);
  if (!(parser instanceof FakeResumeParser))
    throw new Error('Test app is not using the fake parser');
  return parser;
}

/** The token from the verification link in the latest email to this address. */
export function verificationTokenFor(outbox: InMemoryEmailSender, to: string): string {
  const match = /\/verify-email\?token=([\w-]+)/.exec(outbox.lastTo(to)?.text ?? '');
  if (!match?.[1]) throw new Error(`No verification email for ${to}`);
  return match[1];
}

/** Unique email domain per test file run, for cleanup. */
export function testEmails(): { email: (name: string) => string; domain: string } {
  const domain = `${randomUUID().slice(0, 8)}.auth-test.pypr.dev`;
  return { domain, email: (name) => `${name}@${domain}` };
}

export interface SetCookie {
  value: string;
  attributes: string[];
}

/** Cookies from Set-Cookie headers, by name. */
export function setCookies(res: Response): Record<string, SetCookie> {
  const header = res.headers['set-cookie'] as string[] | string | undefined;
  const list = header === undefined ? [] : Array.isArray(header) ? header : [header];
  const result: Record<string, SetCookie> = {};
  for (const line of list) {
    const [pair = '', ...attributes] = line.split(';').map((part) => part.trim());
    const index = pair.indexOf('=');
    result[pair.slice(0, index)] = {
      value: decodeURIComponent(pair.slice(index + 1)),
      attributes: attributes.map((a) => a.toLowerCase()),
    };
  }
  return result;
}

/** A Cookie request header. Built by hand because the test agent drops Secure cookies over http. */
export function cookieHeader(cookies: Record<string, string | undefined>): string {
  return Object.entries(cookies)
    .filter((entry): entry is [string, string] => entry[1] !== undefined)
    .map(([name, value]) => `${name}=${encodeURIComponent(value)}`)
    .join('; ');
}

let ipCounter = 0;
/** A fresh client IP each call (via the trusted loopback proxy), so tests don't share a rate limit. */
export function nextClientIp(): string {
  ipCounter += 1;
  return `198.18.${String(Math.floor(ipCounter / 250) % 250)}.${String(ipCounter % 250)}`;
}

/** Registers and verifies a user; returns a Cookie header for their session. */
export async function signUpUser(
  app: NestExpressApplication,
  email: string,
  password = 'correct horse battery staple',
): Promise<{ cookie: string; accessToken: string }> {
  const server = app.getHttpServer();
  await request(server)
    .post('/api/auth/register')
    .set('Origin', ORIGIN)
    .set('X-Forwarded-For', nextClientIp())
    .send({ email, password })
    .expect(202);
  const res = await request(server)
    .post('/api/auth/verify-email')
    .set('Origin', ORIGIN)
    .set('X-Forwarded-For', nextClientIp())
    .send({ token: verificationTokenFor(outboxOf(app), email) })
    .expect(200);
  const accessToken = setCookies(res).pypr_at?.value ?? '';
  return { accessToken, cookie: cookieHeader({ pypr_at: accessToken }) };
}
