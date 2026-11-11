import { defineConfig } from 'vitest/config';

// Unit tests for the app's pure logic (no device needed).
export default defineConfig({
  test: {
    include: ['app/src/**/*.test.ts'],
    testTimeout: 30_000,
  },
});
