import { fileURLToPath } from 'node:url';

export const API_PORT = 4100;
export const WEB_PORT = 3100;
export const WEB_URL = `http://localhost:${String(WEB_PORT)}`;
export const API_URL = `http://localhost:${String(API_PORT)}`;
export const OUTBOX_DIR = fileURLToPath(new URL('./.outbox', import.meta.url));
export const API_DIR = fileURLToPath(new URL('../api', import.meta.url));
export const WEB_DIR = fileURLToPath(new URL('../web', import.meta.url));
/** Never the dev database: the name must end in _test, like the API tests. */
export const DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://pypr:pypr@localhost:5432/pypr_test';
export const API_FIXTURES = fileURLToPath(new URL('../api/test/fixtures', import.meta.url));
