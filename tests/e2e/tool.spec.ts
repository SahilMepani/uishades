import { test, expect } from '@playwright/test';

/**
 * Tool UI smoke tests.
 *
 * These run against `npm run preview` (the Astro production build) — see
 * `playwright.config.ts`. The host route is `/dev/tool` (NOT `/_dev/tool`):
 * Astro excludes any page whose path segment starts with `_` from the build,
 * so the underscore-prefixed path the spec called for would not exist in the
 * dist. We use a non-underscore directory and tag the page with
 * `<meta name="robots" content="noindex,nofollow">` so it can't leak to
 * search engines.
 *
 * Per-test notes:
 *  - The clipboard test pins to chromium. Playwright's
 *    `grantPermissions(['clipboard-read','clipboard-write'])` is only honored
 *    by chromium; firefox + webkit silently refuse, so testing there would
 *    produce a flaky pass/fail.
 *  - The "type coral" test waits on the actual rendered state (the hex string
 *    in the preview block updates after the 250ms input debounce) rather than
 *    a fixed timeout.
 */

const DEV_URL = '/dev/tool/?c=4040ff';

test.describe('shade tool — smoke', () => {
  test('renders 22 ramp rows for #4040ff', async ({ page }) => {
    await page.goto(DEV_URL);
    // Wait for the island to hydrate (ramp rows are SSR-rendered too, so
    // they should appear basically immediately).
    const rows = page.locator('[data-shade-row="true"]');
    await expect(rows).toHaveCount(22);

    // The page shows the current hex prominently. Mobile-sticky duplicates
    // and the desktop sidebar both render the hex; the visible one depends
    // on the viewport. Use `.filter({ visible: true })` to pick the visible
    // copy regardless of layout.
    await expect(
      page.getByText('#4040ff', { exact: false }).filter({ visible: true }).first(),
    ).toBeVisible();
  });

  test('clicking a shade copies the hex and shows a toast', async ({
    page,
    context,
    browserName,
  }) => {
    test.skip(
      browserName !== 'chromium',
      'navigator.clipboard permission grant only works in chromium under Playwright',
    );
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto(DEV_URL);

    // Click the first non-endpoint shade (the white endpoint at index 0 is
    // visible but a less interesting copy target). Pick the 5th row so the
    // shade has a clear, distinct hex.
    const targetRow = page.locator('[data-shade-row="true"]').nth(5);
    const targetHex = await targetRow.getAttribute('data-hex');
    expect(targetHex).toBeTruthy();
    await targetRow.click();

    // Toast appears
    await expect(page.getByRole('status').filter({ hasText: /Copied/i })).toBeVisible();

    // Clipboard contains the hex
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    expect(clip).toBe(targetHex);
  });

  test('switching to Tailwind scale renders 11 rows with the anchor highlighted', async ({
    page,
  }) => {
    await page.goto(DEV_URL);
    // Click the "Tailwind scale" tab (rendered both on mobile and desktop;
    // playwright defaults to desktop viewport so click the first occurrence).
    await page.getByRole('tab', { name: 'Tailwind scale' }).first().click();

    const rows = page.locator('[data-shade-row="true"]');
    await expect(rows).toHaveCount(11);

    // The row whose hex matches the input (#4040ff) should be the anchor —
    // it shows an "input" badge (rendered when `isInput` is true).
    const anchorRow = page.locator('[data-shade-row="true"][data-hex="#4040ff"]');
    await expect(anchorRow).toHaveCount(1);
    await expect(anchorRow).toContainText(/input/i);
  });

  test('export dropdown switches to Tailwind v3 and renders the config snippet', async ({
    page,
  }) => {
    await page.goto(DEV_URL);
    await page.getByRole('tab', { name: 'Tailwind scale' }).first().click();

    // Change the export-format dropdown.
    await page.getByLabel(/^Export as/).selectOption('tailwind-v3');

    const preview = page.locator('pre[data-export-preview="true"]');
    await expect(preview).toBeVisible();
    const text = await preview.innerText();
    expect(text).toContain('extend:');
    expect(text).toContain('colors:');
  });

  test('typing "coral" in the color input updates the preview hex', async ({
    page,
  }) => {
    await page.goto(DEV_URL);
    // The desktop sidebar and mobile sticky header both render an input
    // with this aria-label. Filter to the visible one for the current
    // viewport (Playwright default is desktop, so the desktop sidebar wins).
    const input = page
      .getByLabel('Color value')
      .filter({ visible: true })
      .first();
    await input.click();
    await input.fill('coral');

    // The autocomplete dropdown should match — accept the first suggestion
    // by pressing Enter (this also bypasses the 250ms parse debounce).
    await input.press('Enter');

    // `coral` maps to #ff7f50. The preview block has role="img" with an
    // aria-label of "Color #ff7f50".
    const preview = page.getByRole('img', { name: /Color #ff7f50/i });
    await expect(preview).toBeVisible({ timeout: 2000 });
  });
});
