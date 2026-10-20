import { defineConfig, devices } from '@playwright/test';
import {
  API_DIR,
  API_PORT,
  API_URL,
  DATABASE_URL,
  OUTBOX_DIR,
  WEB_DIR,
  WEB_PORT,
  WEB_URL,
} from './config.js';
import { MOCK_OPENROUTER_KEY, MOCK_OPENROUTER_PORT } from './mock-openrouter.js';

/**
 * Runs the built API (apps/api/dist) and a production build of the web app on their own
 * ports, against the test database. `pnpm e2e` at the repo root builds the API first.
 */
export default defineConfig({
  testDir: './tests',
  globalSetup: './global-setup.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: WEB_URL, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'node dist/main.js',
      cwd: API_DIR,
      url: `${API_URL}/api/health`,
      timeout: 60_000,
      reuseExistingServer: false,
      env: {
        NODE_ENV: 'test',
        PORT: String(API_PORT),
        DATABASE_URL,
        JWT_ACCESS_SECRET: 'e2e-only-secret-0123456789abcdef0123456789',
        WEB_ORIGINS: WEB_URL,
        APP_URL: WEB_URL,
        TRUST_PROXY: 'loopback',
        EMAIL_PROVIDER: 'outbox',
        EMAIL_OUTBOX_DIR: OUTBOX_DIR,
        RESUME_PARSER_PROVIDER: 'openrouter',
        OPENROUTER_API_KEY: MOCK_OPENROUTER_KEY,
        OPENROUTER_BASE_URL: `http://127.0.0.1:${String(MOCK_OPENROUTER_PORT)}/api/v1`,
      },
    },
    {
      command: `pnpm exec next build && pnpm exec next start --port ${String(WEB_PORT)}`,
      cwd: WEB_DIR,
      url: WEB_URL,
      timeout: 300_000,
      reuseExistingServer: false,
      env: { API_URL, NEXT_DIST_DIR: '.next-e2e', NEXT_TELEMETRY_DISABLED: '1' },
    },
  ],
});
