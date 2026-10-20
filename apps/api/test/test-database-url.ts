// Tests always use the test database, never the one in .env.
// TEST_DATABASE_URL overrides the local Docker default (e.g. in CI).
export const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ?? 'postgresql://pypr:pypr@localhost:5432/pypr_test';
