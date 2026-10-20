import { describe, expect, it } from 'vitest';
import { validateEnv } from './env.js';

const required = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/pypr_dev',
  JWT_ACCESS_SECRET: 'x'.repeat(32),
};

describe('validateEnv', () => {
  it('applies defaults when optional variables are missing', () => {
    expect(validateEnv(required)).toEqual({
      ...required,
      NODE_ENV: 'development',
      PORT: 4000,
      WEB_ORIGINS: ['http://localhost:3000'],
      TRUST_PROXY: 'loopback',
      APP_URL: 'http://localhost:3000',
      EMAIL: { provider: 'console', from: 'Pypr <no-reply@send.pypr.work>' },
      PDF_CONCURRENCY: 2,
      PDF_TIMEOUT_MS: 15_000,
      RESUME_PARSER: { provider: 'disabled' },
    });
  });

  it('groups resume parser settings and keeps the key out of the flat config', () => {
    const env = validateEnv({
      ...required,
      RESUME_PARSER_PROVIDER: 'openrouter',
      OPENROUTER_API_KEY: 'sk-or-test',
    });
    expect(env.RESUME_PARSER).toEqual({
      provider: 'openrouter',
      apiKey: 'sk-or-test',
      model: 'openai/gpt-4.1-mini',
      timeoutMs: 60_000,
      baseUrl: 'https://openrouter.ai/api/v1',
    });
    expect(env).not.toHaveProperty('OPENROUTER_API_KEY');
  });

  it('groups email settings, keeping the Resend key out of the flat config', () => {
    const env = validateEnv({
      ...required,
      EMAIL_PROVIDER: 'resend',
      RESEND_API_KEY: 're_test',
      EMAIL_FROM: 'Pypr <hello@send.pypr.work>',
    });
    expect(env.EMAIL).toEqual({
      provider: 'resend',
      resendApiKey: 're_test',
      from: 'Pypr <hello@send.pypr.work>',
    });
    expect(env).not.toHaveProperty('RESEND_API_KEY');
  });

  it('normalizes APP_URL to an origin', () => {
    expect(validateEnv({ ...required, APP_URL: 'https://app.pypr.work/' }).APP_URL).toBe(
      'https://app.pypr.work',
    );
  });

  it('coerces PORT from a string', () => {
    const production = { NODE_ENV: 'production', EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 're_x' };
    expect(validateEnv({ ...required, ...production, PORT: '5001' })).toMatchObject({
      NODE_ENV: 'production',
      PORT: 5001,
    });
  });

  it('accepts the postgres:// scheme too', () => {
    const url = 'postgres://user:pass@db.example.com:6543/postgres';
    expect(validateEnv({ ...required, DATABASE_URL: url }).DATABASE_URL).toBe(url);
  });

  it('parses WEB_ORIGINS into normalized origins', () => {
    const env = validateEnv({
      ...required,
      WEB_ORIGINS: 'https://app.pypr.work/, http://localhost:3000 ,',
    });
    expect(env.WEB_ORIGINS).toEqual(['https://app.pypr.work', 'http://localhost:3000']);
  });

  it.each([
    ['true', true],
    ['false', false],
    ['2', 2],
    ['10.0.0.0/8', '10.0.0.0/8'],
  ])('parses TRUST_PROXY=%s', (value, expected) => {
    expect(validateEnv({ ...required, TRUST_PROXY: value }).TRUST_PROXY).toBe(expected);
  });

  it('ignores unrelated variables', () => {
    expect(validateEnv({ ...required, HOME: '/home/x' })).not.toHaveProperty('HOME');
  });

  it.each([
    {},
    { ...required, DATABASE_URL: undefined },
    { ...required, DATABASE_URL: 'not a url' },
    { ...required, DATABASE_URL: 'mysql://user:pass@localhost/db' },
    { ...required, JWT_ACCESS_SECRET: undefined },
    { ...required, JWT_ACCESS_SECRET: 'too-short' },
    { ...required, WEB_ORIGINS: 'ftp://files.example.com' },
    { ...required, WEB_ORIGINS: ' , ' },
    { ...required, PORT: 'abc' },
    { ...required, PORT: '0' },
    { ...required, PORT: '70000' },
    { ...required, NODE_ENV: 'staging' },
    { ...required, EMAIL_PROVIDER: 'resend' },
    { ...required, EMAIL_PROVIDER: 'smtp' },
    { ...required, NODE_ENV: 'production' },
    { ...required, APP_URL: 'not a url' },
    { ...required, PDF_CONCURRENCY: '0' },
    { ...required, EMAIL_PROVIDER: 'outbox' },
    { ...required, RESUME_PARSER_PROVIDER: 'openrouter' },
    { ...required, RESUME_PARSER_PROVIDER: 'gemini' },
    {
      ...required,
      NODE_ENV: 'production',
      EMAIL_PROVIDER: 'outbox',
      EMAIL_OUTBOX_DIR: '/tmp/outbox',
    },
  ])('rejects %j', (input) => {
    expect(() => validateEnv(input)).toThrow(/Invalid environment variables/);
  });

  it('does not echo rejected values', () => {
    let message = '';
    try {
      validateEnv({
        DATABASE_URL: 'mysql://admin:hunter2@localhost/db',
        JWT_ACCESS_SECRET: 'tiny-secret',
      });
    } catch (error) {
      message = String(error);
    }
    expect(message).toContain('DATABASE_URL');
    expect(message).toContain('JWT_ACCESS_SECRET');
    expect(message).not.toContain('hunter2');
    expect(message).not.toContain('tiny-secret');
  });
});
