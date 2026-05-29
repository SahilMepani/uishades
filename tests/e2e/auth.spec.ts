import { test, expect } from '@playwright/test';

/**
 * Account UI smoke test (signed-out state).
 *
 * Runs against `npm run preview` (the production build). With no session, the
 * island's `/api/me` probe returns `{ user: null }` (or fails gracefully), so
 * the AuthMenu renders its signed-out controls. This guards that the island
 * integrates the auth UI and exposes the redirect-flow entry points.
 *
 * The signed-in round-trip (real OAuth + email) is impractical to automate in
 * CI, so it is NOT covered here. The session-independent server logic — token
 * hashing, the verified-email gate, magic-token consume/peek, OAuth account
 * resolution (email-change and cross-provider linking), and preset scoping — is
 * unit-tested in tests/auth-*.spec.ts against an in-memory D1 fake instead.
 *
 * The desktop sidebar and the mobile block each render an AuthMenu, so two
 * copies exist in the DOM; we target the visible one for the chromium viewport.
 */

test.describe('account UI — signed out', () => {
  test('home shows OAuth links and the magic-link email field', async ({ page }) => {
    await page.goto('/');

    const google = page
      .getByRole('link', { name: 'Continue with Google' })
      .filter({ visible: true })
      .first();
    await expect(google).toBeVisible();
    await expect(google).toHaveAttribute('href', '/api/auth/google');

    const github = page
      .getByRole('link', { name: 'Continue with GitHub' })
      .filter({ visible: true })
      .first();
    await expect(github).toHaveAttribute('href', '/api/auth/github');

    await expect(
      page.getByLabel('Email for a sign-in link').filter({ visible: true }).first(),
    ).toBeVisible();
  });
});
