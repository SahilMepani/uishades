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

// Wave A's audit step A9 hard-404s /dev/tool/ in production builds, and
// Playwright runs against `npm run preview` (a production build), so we
// can't use the dev-tool host any more. /4040ff is the real shade route,
// SSR-renders the same React island, and is a more faithful smoke target.
const DEV_URL = '/4040ff';

test.describe('shade tool — smoke', () => {
  test('renders 20 OKLCH ramp rows for #4040ff', async ({ page }) => {
    // The OKLCH ramp is no longer the default view (Tailwind is), so deep-link
    // into it. Ramp rows are SSR-rendered, so they appear basically
    // immediately after hydration.
    await page.goto('/4040ff?view=ramp');
    const rows = page.locator('[data-shade-row="true"]');
    await expect(rows).toHaveCount(20);

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

    // Default view is the Tailwind scale (11 rows). Pick a mid-scale row so
    // the shade has a clear, distinct hex to verify against the clipboard.
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

  test('downloads the ramp as a PNG with a hex/mode filename', async ({
    page,
    browserName,
  }) => {
    // Blob-URL anchor downloads are captured reliably by Playwright's
    // download event in chromium; firefox/webkit under Playwright are flaky
    // about surfacing blob downloads, so we pin the assertion to chromium —
    // same rationale as the clipboard test above.
    test.skip(
      browserName !== 'chromium',
      'blob-URL download capture is only reliable in chromium under Playwright',
    );
    // The ramp PNG button only exists in the OKLCH ramp view; deep-link in.
    await page.goto('/4040ff?view=ramp');

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /download ramp as png/i }).first().click();
    const download = await downloadPromise;
    // OKLCH ramp for #4040ff → uishades-4040ff-oklch.png
    expect(download.suggestedFilename()).toBe('uishades-4040ff-oklch.png');
  });

  test('downloads the Tailwind scale as a PNG with a scale filename', async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName !== 'chromium',
      'blob-URL download capture is only reliable in chromium under Playwright',
    );
    await page.goto('/4040ff?view=scale');
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /download scale as png/i }).first().click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('uishades-4040ff-scale.png');
  });

  test('switching to the Tailwind scale renders 11 rows with the anchor highlighted', async ({
    page,
    browserName,
  }) => {
    // webkit under Playwright doesn't reliably fire React's onClick on the
    // algorithm tab button, so the view never switches and the assertion sees
    // the 20 ramp rows instead of 11. This is the same webkit click-delivery
    // class as the picker-trigger / programmatic-focus quirks documented in the
    // other specs (real Safari is unaffected) — NOT a lazy-load issue: the
    // scale grid is shipped eagerly now, so a successful click renders the 11
    // rows immediately.
    test.fixme(browserName === 'webkit', 'webkit onClick delivery on the tab button');
    // Start on the OKLCH ramp, then switch to Tailwind.
    await page.goto('/4040ff?view=ramp');
    // Click the "Tailwind" tab (rendered both on mobile and desktop; playwright
    // defaults to desktop viewport so click the first occurrence).
    await page.getByRole('tab', { name: 'Tailwind' }).first().click();

    const rows = page.locator('[data-shade-row="true"]');
    await expect(rows).toHaveCount(11);

    // The row whose hex matches the input (#4040ff) should be the anchor —
    // it shows a "Source" badge (rendered when the row is the pinned source).
    const anchorRow = page.locator('[data-shade-row="true"][data-hex="#4040ff"]');
    await expect(anchorRow).toHaveCount(1);
    await expect(anchorRow).toContainText(/source/i);
  });

  test('export dropdown switches to Tailwind v3 and renders the config snippet', async ({
    page,
    browserName,
  }) => {
    // webkit under Playwright is flaky delivering clicks to the lazy export
    // panel's controls (the "View code" modal never opens), so the preview
    // assertion below times out. Same webkit click-delivery class as the other
    // fixmes; real Safari is unaffected. Tailwind is the default view, so the
    // controls are present on load and the dropdown chunk loads at hydration.
    test.fixme(browserName === 'webkit', 'webkit click delivery on the lazy export panel');
    await page.goto(DEV_URL);

    // Change the export-format dropdown.
    await page.getByLabel(/^Export as/).selectOption('tailwind-v3');

    // The code preview now lives in the "View code" modal, not inline.
    await page.getByRole('button', { name: /view export code/i }).click();

    const preview = page.locator('pre[data-export-preview="true"]');
    await expect(preview).toBeVisible();
    const text = await preview.innerText();
    expect(text).toContain('extend:');
    expect(text).toContain('colors:');
  });

  test('deep-link `?view=scale` starts on the Tailwind scale view', async ({
    page,
  }) => {
    // SSR-derived initial view: when the URL carries `?view=scale` we want
    // the React island to mount in scale mode (not ramp), so a shared
    // link to a specific stop preview lands the user on the right tab.
    await page.goto('/4040ff?view=scale');
    // 11-stop scale should be rendered, not the 20-step ramp.
    const rows = page.locator('[data-shade-row="true"]');
    await expect(rows).toHaveCount(11);
    // And the export dropdown (only in scale view) should be reachable.
    await expect(page.getByLabel(/^Export as/)).toBeVisible();
  });

  test('typing "coral" in the color value input updates the preview hex', async ({
    page,
    browserName,
  }) => {
    // webkit under Playwright doesn't reliably propagate a programmatic fill()
    // to React's onChange, so the hex never updates in-test. Real Safari users
    // are unaffected; chromium + firefox cover this flow.
    test.fixme(browserName === 'webkit', 'webkit fill() → React onChange flaky under Playwright');
    await page.goto(DEV_URL);

    // Free-text color entry — including CSS names like "coral" — lives on the
    // always-visible color input. (The picker popover's input is now
    // format-specific, hex-only by default, so name entry happens here.) Two
    // copies render — desktop rail + mobile block — so target the visible one.
    const input = page
      .getByLabel('Color value (hex, rgb, hsl, oklch, or name)')
      .filter({ visible: true })
      .first();
    await input.fill('coral');

    // parseColor runs on every keystroke (no debounce), so the hex updates
    // synchronously. `coral` resolves to #ff7f50, and the picker trigger's
    // accessible name reflects the current hex.
    const trigger = page
      .getByRole('button', { name: /open color picker/i })
      .filter({ visible: true })
      .first();
    await expect(trigger).toHaveAccessibleName(
      /Color #ff7f50 - open color picker/i,
      { timeout: 2000 },
    );
  });
});
