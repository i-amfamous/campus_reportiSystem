import { defineConfig } from 'tsup';
import { resolve } from 'node:path';

export default defineConfig({
  entry: {
    server: 'src/server.ts',
    'jobs/worker-entry': 'src/jobs/worker-entry.ts',
    seed: 'prisma/seed.ts',
  },
  outDir: 'dist',
  format: ['esm'],
  platform: 'node',
  target: 'node20',
  sourcemap: true,
  clean: true,
  splitting: false,
  noExternal: ['@campus-resolve/shared'],
  // `dotenv` reads the file system through a dynamic `require`, which cannot
  // be bundled into an ES module. It stays an external runtime dependency.
  external: ['dotenv'],
  esbuildOptions(options) {
    options.alias = {
      ...(options.alias ?? {}),
      '@campus-resolve/shared': resolve(__dirname, '../../packages/shared/src/index.ts'),
    };
  },
});
