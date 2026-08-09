import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig({
  base: '',
  server: {
    host: '::',
    port: 8080,
    hmr: false,
  },
  plugins: [],
  css: {
    postcss: './postcss.config.js',
  },
  resolve: {
    alias: {
      phaser: 'phaser/dist/phaser.js',
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['src/test/setup.ts'],
    include: ['src/test/**/*.{test,spec}.ts'],
    testTimeout: 10000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
    },
  },
});
