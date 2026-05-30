import { defineConfig } from 'vitest/config';

// Playwright lives in `tests/e2e/**` and is run via `npm run test:e2e`.
// Vitest must not try to load those files (they use the Playwright runner).
export default defineConfig({
  test: {
    include: ['tests/**/*.spec.ts'],
    exclude: ['tests/e2e/**', 'node_modules/**', 'dist/**', '.astro/**'],
  },
});
