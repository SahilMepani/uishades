import { test, expect } from '@playwright/test';

/**
 * Mobile viewport regression suite.
 *
 * Verifies:
 *   - The sticky preview header stays visible while scrolling shades.
 *   - All tap targets in the shade list are >= 44x44 CSS px (WCAG 2.5.5).
 *   - There is no horizontal scroll at 375 wide.
 *
 * Note: the desktop sidebar (PreviewBlock + ColorPicker) is `hidden lg:block`,
 * so there is no color input on mobile — mobile users change the color by
 * navigating to a different /[hex] URL or via the home page. The historical
 * "focusing the color input doesn't push the sticky off-screen" test was
 * removed when the picker UI dropped its mobile presence.
 *
 * Configured through `testMatch: /mobile\.spec\.ts$/` so only the
 * `mobile-chrome` project picks it up — running it under a desktop viewport
 * would fail because the sticky header is `lg:hidden`.
 */

// /dev/tool/ hard-404s in production builds (Wave A audit step A9), and
// Playwright runs against `npm run preview` (a production build). The real
// /[hex] SSR route hosts the same React island, so we target it instead.
const DEV_URL = '/4040ff';

test.describe('mobile (375x667)', () => {
  test('sticky preview stays at the top after scroll', async ({ page }) => {
    await page.goto(DEV_URL);
    // The sticky header has `top-0 sticky`. Before scrolling, it sits at its
    // natural flow position (16px on `/[hex].astro` because <main> has pt-4 —
    // the page heading is sr-only, so the sticky is the first visible thing).
    // After scrolling past that origin, sticky pins to viewport top === 0.
    const sticky = page.locator('div.sticky.top-0').first();
    await expect(sticky).toBeVisible();

    await page.evaluate(() => window.scrollTo({ top: 800, behavior: 'auto' }));
    const afterTop = await sticky.evaluate(
      (el) => el.getBoundingClientRect().top,
    );
    expect(afterTop).toBeCloseTo(0, 0);
  });

  test('no horizontal overflow', async ({ page }) => {
    await page.goto(DEV_URL);
    const overflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    expect(overflow).toBe(false);
  });

  test('shade-row tap targets are >= 44x44 CSS px', async ({ page }) => {
    await page.goto(DEV_URL);
    const rows = page.locator('[data-shade-row="true"]');
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);
    // Sample the first 6 rows — they're identical shape, no need to scan
    // every one.
    for (let i = 0; i < Math.min(6, count); i++) {
      const box = await rows.nth(i).boundingBox();
      expect(box).not.toBeNull();
      if (box) {
        expect(box.height).toBeGreaterThanOrEqual(44);
        expect(box.width).toBeGreaterThanOrEqual(44);
      }
    }
  });

});
