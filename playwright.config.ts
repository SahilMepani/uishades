import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for shades.dev end-to-end tests.
 *
 * We E2E against the production build via `npm run preview` (not `dev`) so the
 * suite exercises the exact bundles that ship to Cloudflare Pages.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    // Pin to 127.0.0.1 instead of `localhost`. On Windows, Firefox prefers
    // IPv6 for `localhost` and `astro preview` (a Vite static server) does
    // not always bind both stacks. The IPv4 literal sidesteps the mismatch
    // that produced NS_ERROR_CONNECTION_REFUSED flakes under parallel load.
    baseURL: 'http://127.0.0.1:4321',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      // Desktop viewports must skip the mobile-only sticky-header spec.
      testIgnore: /mobile\.spec\.ts$/,
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
      testIgnore: /mobile\.spec\.ts$/,
      // Firefox driver opens a fresh TCP connection per page.goto and the
      // static preview server intermittently refuses concurrent connects on
      // Windows. Serialize this project. Other browsers stay parallel.
      workers: 1,
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
      testIgnore: /mobile\.spec\.ts$/,
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
      // Mobile project runs only the mobile sticky/tap-target suite.
      testMatch: /mobile\.spec\.ts$/,
    },
  ],
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1',
    url: 'http://127.0.0.1:4321',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
