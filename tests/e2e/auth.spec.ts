import { test, expect } from '@playwright/test';

/**
 * Account UI smoke test (signed-out state).
 *
 * Runs against `npm run preview` (the production build). With no session, the
 * `/api/me` probe resolves to `{ user: null }`, so HeaderAuth renders a "Sign
 * in" button. Clicking it opens a modal whose AuthMenu exposes the OAuth
 * redirect entry points + the magic-link email field. (Sign-in is modal-only —
 * the left-rail PresetsPanel no longer duplicates it when signed out — so the
 * controls live behind the trigger, not inline on the page.)
 *
 * The signed-in round-trip (real OAuth + email) is impractical to automate in
 * CI, so it is NOT covered here. The session-independent server logic — token
 * hashing, the verified-email gate, magic-token consume/peek, OAuth account
 * resolution (email-change and cross-provider linking), and preset/palette
 * scoping — is unit-tested in tests/auth-*.spec.ts and tests/palettes-db.spec.ts
 * against an in-memory D1 fake instead.
 */

test.describe('account UI — signed out', () => {
  test('the Sign in modal exposes OAuth links and the magic-link email field', async ({
    page,
  }) => {
    await page.goto('/');

    // The trigger is disabled until the /api/me probe resolves; clicking waits
    // for it to become actionable (enabled), confirming the signed-out state.
    await page.getByRole('button', { name: 'Sign in' }).first().click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    const google = dialog.getByRole('link', { name: 'Continue with Google' });
    await expect(google).toBeVisible();
    await expect(google).toHaveAttribute('href', '/api/auth/google');

    const github = dialog.getByRole('link', { name: 'Continue with GitHub' });
    await expect(github).toHaveAttribute('href', '/api/auth/github');

    await expect(dialog.getByLabel('Email for a sign-in link')).toBeVisible();
  });
});
