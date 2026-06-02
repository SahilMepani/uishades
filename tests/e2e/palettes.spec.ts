import { test, expect } from '@playwright/test';

/**
 * Public-surface smoke tests for the palettes feature (Explore gallery, public
 * palette pages), all signed-out.
 *
 * Mirrors auth.spec.ts's philosophy: the signed-in round-trip (save a palette,
 * vote) needs a real session and is impractical to automate, so it stays
 * unit-tested (tests/palettes-db.spec.ts, tests/moderation.spec.ts). What we
 * E2E here is that the PUBLIC routes render from the production build and that
 * unknown slugs 404 rather than 500 — i.e. the SSR data-loading + cache wiring
 * is sound against the real worker.
 *
 * The local D1 may have zero public palettes, so these assert on the page
 * chrome (gallery scaffolding, filter controls, 404 behaviour) — states that
 * hold regardless of seeded data.
 */

test.describe('explore gallery — signed out', () => {
  test('renders the gallery with filter controls', async ({ page }) => {
    const res = await page.goto('/explore');
    expect(res?.status()).toBe(200);

    // ExploreGrid renders the gallery heading plus the tag-filter chips
    // (e.g. "#warm"). These are static page chrome (the `TAGS` list), so they
    // hold regardless of how many public palettes the local D1 has seeded.
    // The sort segmented control was intentionally removed in the seed-only
    // gallery refactor, so we no longer assert on it.
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('button', { name: '#warm' })).toBeVisible();
  });
});

test.describe('public palette page — signed out', () => {
  test('unknown slug returns 404', async ({ page }) => {
    const res = await page.goto('/p/this-palette-does-not-exist-xyz');
    expect(res?.status()).toBe(404);
  });
});

// Happy path against the deterministic fixture seeded in CI (tests/fixtures/
// seed-e2e.sql): a real published palette. This exercises the SSR render path
// that the 404-only tests never reach — the gap that let an Astro v6
// `locals.runtime.ctx` crash ship undetected on /p/[slug].
test.describe('published palette — signed out', () => {
  test('a published palette page renders (not 404)', async ({ page }) => {
    const res = await page.goto('/p/e2e-fixture-palette');
    expect(res?.status()).toBe(200);
    await expect(page.getByRole('heading', { name: /E2E Fixture/i })).toBeVisible();
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
