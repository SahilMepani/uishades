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
  test('renders 20 ramp rows for #4040ff', async ({ page }) => {
    await page.goto(DEV_URL);
    // Wait for the island to hydrate (ramp rows are SSR-rendered too, so
    // they should appear basically immediately).
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
    await page.goto(DEV_URL);

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /download ramp as png/i }).first().click();
    const download = await downloadPromise;
    // Default oklch ramp for #4040ff → uishades-4040ff-oklch.png
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

  test('switching to Tailwind scale renders 11 rows with the anchor highlighted', async ({
    page,
    browserName,
  }) => {
    // TODO: webkit times out before the React.lazy chunk for TailwindScale +
    // ExportDropdown finishes loading on tab click. The `?view=scale` deep-link
    // test below works in webkit because the scale view is server-prerendered
    // there and the lazy chunk arrives with the initial hydration. Re-enable
    // once we either pre-warm the chunk or raise the per-test timeout.
    test.fixme(browserName === 'webkit', 'webkit lazy-load timing on tab click');
    await page.goto(DEV_URL);
    // Click the "Tailwind scale" tab (rendered both on mobile and desktop;
    // playwright defaults to desktop viewport so click the first occurrence).
    await page.getByRole('tab', { name: 'Tailwind scale' }).first().click();

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
    // TODO: same webkit lazy-load timing as the test above. The `?view=scale`
    // deep-link path renders Tailwind fine in webkit, so the chunk loads when
    // requested at hydration time — only the click-to-load path is flaky.
    test.fixme(browserName === 'webkit', 'webkit lazy-load timing on tab click');
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

  test('typing "coral" in the color picker input updates the preview hex', async ({
    page,
    browserName,
  }) => {
    // TODO: webkit under Playwright doesn't fire React's onClick when clicking
    // the picker trigger button (decorative absolute-positioned swatch layers
    // appear to swallow the event in webkit's hit-testing). Real Safari users
    // are not affected.
    test.fixme(browserName === 'webkit', 'webkit picker-trigger click hit-test quirk');
    await page.goto(DEV_URL);
    // Open the picker to reveal the smart text input. The input is only
    // mounted while the popover is open.
    const trigger = page
      .getByRole('button', { name: /open color picker/i })
      .first();
    await trigger.click();
    // aria-expanded flips synchronously from the onClick. We anchor on it
    // rather than the dialog's role because the popover briefly carries
    // aria-hidden="true" while it transitions in, hiding it from accessibility-
    // tree selectors. CSS selectors bypass that.
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');

    // The PreviewBlock smart input shares this aria-label, so scope to the
    // ColorPicker popover. A CSS attribute selector (not getByRole) is used
    // deliberately: the dialog carries aria-hidden="true" while transitioning
    // in, which would hide it from accessibility-tree selectors.
    const input = page.locator('[role="dialog"] input[aria-label^="Color value"]');
    await input.fill('coral');

    // ColorPicker parses on every keystroke (no debounce, no autocomplete),
    // so the parent hex updates synchronously. `coral` resolves to #ff7f50,
    // and the trigger button's accessible name reflects the current hex.
    await expect(trigger).toHaveAccessibleName(
      /Color #ff7f50 — open color picker/i,
      { timeout: 2000 },
    );
  });
});
