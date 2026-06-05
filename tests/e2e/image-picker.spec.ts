import { expect, test } from '@playwright/test';

// Coverage for the /image-color-picker sample images: the empty state offers a
// one-click demo for each source type, and clicking one runs it through the same
// extraction path as an upload (the logo also exercises the transparent-PNG path,
// where the empty margin must be skipped and only the solid colors extracted).
//
// These click a sample, which fetches it and decodes it via createImageBitmap +
// canvas. webkit under Playwright is flaky delivering that click and resolving
// the off-thread decode (the same click-delivery class fixme'd across
// tool.spec.ts); real Safari is unaffected. So they run on chromium + firefox.
test.describe('image picker samples', () => {
  test('offers all four samples and extracts on click', async ({ page, browserName }) => {
    test.fixme(browserName === 'webkit', 'webkit click + canvas decode flaky under Playwright');
    await page.goto('/image-color-picker');

    for (const label of ['Gradient', 'Logo', 'Photo', 'Landscape']) {
      await expect(
        page.getByRole('button', { name: `Use the ${label} sample image` }),
      ).toBeVisible();
    }

    await page.getByRole('button', { name: 'Use the Gradient sample image' }).click();
    await expect(page.getByAltText(/Uploaded source image/)).toBeVisible();
    expect(
      await page.getByRole('button', { name: /^Color #/ }).count(),
    ).toBeGreaterThan(1);
  });

  test('extracts solid colors from a transparent logo', async ({ page, browserName }) => {
    test.fixme(browserName === 'webkit', 'webkit click + canvas decode flaky under Playwright');
    await page.goto('/image-color-picker');
    await page.getByRole('button', { name: 'Use the Logo sample image' }).click();
    await expect(page.getByAltText(/Uploaded source image/)).toBeVisible();
    // The card colors, with the transparent ground skipped (no white/black seeded).
    await expect(page.getByRole('button', { name: /^Color #/ }).first()).toBeVisible({
      timeout: 10_000,
    });
    expect(
      await page.getByRole('button', { name: /^Color #/ }).count(),
    ).toBeGreaterThan(1);
  });
});
