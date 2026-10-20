import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { testDatabaseUrl } from './test-database-url.js';

/**
 * Runs once before the API tests: checks we point at a test database, then applies
 * pending migrations (`migrate deploy` only applies; it never resets or drops).
 */
export default function setup(): void {
  const url = testDatabaseUrl;
  const databaseName = new URL(url).pathname.slice(1);
  if (!databaseName.endsWith('_test')) {
    throw new Error(
      `Refusing to run tests against "${databaseName}": the database name must end in _test.`,
    );
  }

  try {
    execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
      cwd: fileURLToPath(new URL('..', import.meta.url)),
      env: { ...process.env, DATABASE_URL: url },
      stdio: 'pipe',
    });
  } catch (error) {
    const output = (error as { stderr?: Buffer }).stderr?.toString() ?? '';
    throw new Error(
      `Could not migrate the test database "${databaseName}". Is Postgres running? ` +
        `Start it with \`pnpm db:up\`.\n${output}`,
      { cause: error },
    );
  }
}
