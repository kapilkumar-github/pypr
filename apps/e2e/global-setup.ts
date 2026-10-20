import { execFileSync } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { API_DIR, DATABASE_URL, OUTBOX_DIR } from './config.js';
import { startMockOpenRouter } from './mock-openrouter.js';

export default async function globalSetup(): Promise<() => Promise<void>> {
  const name = new URL(DATABASE_URL).pathname.slice(1);
  if (!name.endsWith('_test')) {
    throw new Error(`Refusing to run end-to-end tests against "${name}" (must end in _test).`);
  }
  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    cwd: API_DIR,
    env: { ...process.env, DATABASE_URL },
    stdio: 'pipe',
  });
  await rm(OUTBOX_DIR, { recursive: true, force: true });

  const mock = await startMockOpenRouter();
  return () =>
    new Promise((resolve) =>
      mock.close(() => {
        resolve();
      }),
    );
}
