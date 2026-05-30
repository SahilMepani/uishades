import { test, expect } from '@playwright/test';

/**
 * Public-surface smoke tests for the palettes feature (Explore gallery, public
 * palette pages, public profiles), all signed-out.
 *
 * Mirrors auth.spec.ts's philosophy: the signed-in round-trip (save a palette,
 * vote, set a handle) needs a real session and is impractical to automate, so
 * it stays unit-tested (tests/palettes-db.spec.ts, tests/moderation.spec.ts).
 * What we E2E here is that the new PUBLIC routes render from the production
 * build and that unknown slugs/handles 404 rather than 500 — i.e. the SSR
 * data-loading + cache wiring is sound against the real worker.
 *
 * The local D1 may have zero public palettes, so these assert on the page
 * chrome (gallery scaffolding, filter controls, 404 behaviour) — states that
 * hold regardless of seeded data.
 */

test.describe('explore gallery — signed out', () => {
  test('renders the gallery with sort controls', async ({ page }) => {
    const res = await page.goto('/explore');
    expect(res?.status()).toBe(200);

    // The sort segmented control is an ARIA tablist in the SSR'd / hydrated
    // ExploreGrid (Top / New / Trending / Featured tabs).
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Featured' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Top' })).toBeVisible();
  });
});

test.describe('public palette page — signed out', () => {
  test('unknown slug returns 404', async ({ page }) => {
    const res = await page.goto('/p/this-palette-does-not-exist-xyz');
    expect(res?.status()).toBe(404);
  });
});

test.describe('public profile — signed out', () => {
  test('unknown handle returns 404', async ({ page }) => {
    const res = await page.goto('/u/nobody-here-xyz');
    expect(res?.status()).toBe(404);
  });

  test('profile JSON for unknown handle returns 404', async ({ request }) => {
    const res = await request.get('/api/u/nobody-here-xyz.json');
    expect(res.status()).toBe(404);
  });
});

// Happy paths against the deterministic fixture seeded in CI (tests/fixtures/
// seed-e2e.sql): a real published palette + its owner's profile. These exercise
// the SSR render path that the 404-only tests never reach — the gap that let an
// Astro v6 `locals.runtime.ctx` crash ship undetected on /p/[slug].
test.describe('published palette + profile — signed out', () => {
  test('a published palette page renders (not 404)', async ({ page }) => {
    const res = await page.goto('/p/e2e-fixture-palette');
    expect(res?.status()).toBe(200);
    await expect(page.getByRole('heading', { name: /E2E Fixture/i })).toBeVisible();
  });

  test('a public profile renders its owner', async ({ page }) => {
    const res = await page.goto('/u/e2euser');
    expect(res?.status()).toBe(200);
    await expect(page.getByText('E2E User')).toBeVisible();
  });
});

test.describe('explore API — signed out', () => {
  test('returns an items array and a nextCursor field', async ({ request }) => {
    const res = await request.get('/api/explore');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.items)).toBe(true);
    expect(body).toHaveProperty('nextCursor');
  });

  test('an invalid color filter does not error', async ({ request }) => {
    const res = await request.get('/api/explore?color=not-a-hex');
    expect(res.status()).toBe(200);
  });
});
