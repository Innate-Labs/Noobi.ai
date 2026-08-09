import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    exclude: ['node_modules', 'dist', 'output'],
  },
  resolve: {
    alias: {
      '@opengame/core': path.resolve(__dirname, '../packages/core/src'),
      '@opengame/opengame-core': path.resolve(
        __dirname,
        '../packages/core/src',
      ),
      '@opengame/test-utils': path.resolve(__dirname, '../packages/test-utils'),
    },
  },
});
