import { test, expect } from '@playwright/test';

/**
 * /colors — the named-color index.
 *
 * Static (pre-rendered) page listing every NAMED_COLORS entry grouped by
 * color family, each card linking to its /colors/[name] detail page. Runs
 * against `npm run preview` (the production build) like the other e2e specs.
 */

const FAMILY_HEADINGS = [
  'Red', 'Orange', 'Yellow', 'Green', 'Teal', 'Blue',
  'Indigo', 'Purple', 'Pink', 'Brown', 'Gray', 'Neutral',
];

test.describe('named-color index — /colors', () => {
  test('renders the index heading', async ({ page }) => {
    await page.goto('/colors');
    await expect(
      page.getByRole('heading', { level: 1, name: /all named colors/i }),
    ).toBeVisible();
  });

  test('renders all twelve family sections', async ({ page }) => {
    await page.goto('/colors');
    for (const family of FAMILY_HEADINGS) {
      await expect(
        page.getByRole('heading', { level: 2, name: family, exact: true }),
      ).toBeVisible();
    }
  });

  test('a known color card links to its detail page', async ({ page, browserName }) => {
    test.fixme(browserName === 'webkit', 'webkit click delivery on the color card link');
    await page.goto('/colors');
    const coral = page.locator('a[href="/colors/coral"]').first();
    await expect(coral).toBeVisible();
    await coral.click();
    await expect(page).toHaveURL(/\/colors\/coral$/);
  });
});
