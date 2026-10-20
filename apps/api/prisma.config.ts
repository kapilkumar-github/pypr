import { defineConfig } from 'prisma/config';

// Prisma 7 doesn't read .env itself. Load it when present; real environment variables win.
try {
  process.loadEnvFile('.env');
} catch {
  // No .env file (CI, production): rely on the environment.
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // `prisma generate` doesn't connect, so it may run without a database URL (e.g. in CI).
    url: process.env.DATABASE_URL ?? '',
  },
});
