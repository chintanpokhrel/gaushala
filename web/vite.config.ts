import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative paths: the site is served from https://<user>.github.io/<repo>/.
  base: './',
  build: {
    // iOS 15.4 is the oldest Safari with everything the app uses (share files, randomUUID).
    target: ['es2020', 'safari15'],
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
});
