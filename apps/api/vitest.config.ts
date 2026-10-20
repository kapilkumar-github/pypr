import { defineConfig } from 'vitest/config';
import { testDatabaseUrl } from './test/test-database-url.js';

export default defineConfig({
  test: {
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: testDatabaseUrl,
      JWT_ACCESS_SECRET: 'test-only-secret-0123456789abcdef0123456789',
      EMAIL_PROVIDER: 'console',
      APP_URL: 'http://localhost:3000',
    },
    globalSetup: ['./test/global-setup.ts'],
  },
});
