import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    maxWorkers: 2,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    environmentOptions: { jsdom: { url: 'http://127.0.0.1:3100/' } },
    include: ['tests/**/*.test.tsx'],
  },
});
