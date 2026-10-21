import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['./tests/setup.ts'],
    globalSetup: ['./tests/global-setup.ts'],
    // All suites share a single PostgreSQL database, so they must not run
    // concurrently with each other.
    fileParallelism: false,
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    testTimeout: 30_000,
    hookTimeout: 60_000,
    reporters: ['default'],
    alias: {
      '@campus-resolve/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
    },
  },
});
