import { test, expect } from '@playwright/test';

/**
 * Mobile viewport regression suite.
 *
 * Verifies:
 *   - The sticky preview header stays visible while scrolling shades.
 *   - All tap targets in the shade list are >= 44x44 CSS px (WCAG 2.5.5).
 *   - There is no horizontal scroll at 375 wide.
 *   - Opening the color input doesn't push the sticky header off-screen
 *     (the input itself sits below the preview, so focusing it should keep
 *     the preview pinned at the top).
 *
 * Configured through `testMatch: /mobile\.spec\.ts$/` so only the
 * `mobile-chrome` project picks it up — running it under a desktop viewport
 * would fail because the sticky header is `lg:hidden`.
 */

const DEV_URL = '/dev/tool/?c=4040ff';

test.describe('mobile (375x667)', () => {
  test('sticky preview stays at the top after scroll', async ({ page }) => {
    await page.goto(DEV_URL);
    // The sticky header has `top-0 sticky`. Confirm it has a measured top
    // of 0 before and after scrolling the page.
    const sticky = page.locator('div.sticky.top-0').first();
    await expect(sticky).toBeVisible();
    const beforeTop = await sticky.evaluate(
      (el) => el.getBoundingClientRect().top,
    );
    expect(beforeTop).toBeCloseTo(0, 0);

    // Scroll the shade list down a lot — the sticky header should still
    // report top === 0 (it follows the viewport, not the doc).
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

  test('focusing the color input does not push sticky header off-screen', async ({
    page,
  }) => {
    await page.goto(DEV_URL);
    const input = page
      .getByLabel('Color value')
      .filter({ visible: true })
      .first();
    await input.click();
    // Sticky header should still be at top == 0 after focusing input.
    const stickyTop = await page
      .locator('div.sticky.top-0')
      .first()
      .evaluate((el) => el.getBoundingClientRect().top);
    expect(stickyTop).toBeCloseTo(0, 0);
  });
});
