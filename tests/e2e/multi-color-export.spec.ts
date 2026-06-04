import { test, expect } from '@playwright/test';

/**
 * Regression for the reported bug: with two or more colors in the palette tray
 * the shade view becomes a multi-column grid, but the export preview only ever
 * showed the ACTIVE color's shades. The export must now emit every palette
 * color, one named family each.
 */
test.describe('multi-color palette export', () => {
  test('export emits every palette color, not just the active one', async ({
    page,
    browserName,
  }) => {
    // webkit under Playwright is flaky both delivering clicks to the lazy
    // export panel and propagating fill() to React's onChange; real Safari is
    // unaffected. Same class as the other webkit fixmes in tool.spec.ts.
    test.fixme(browserName === 'webkit', 'webkit lazy-panel / fill() flakiness');

    await page.goto('/4040ff'); // tray auto-seeds with #4040ff on mount

    // Change the active color to a clearly different hue, then add it - the tray
    // now holds two colors and the view flips to the column-per-color grid.
    const input = page
      .getByLabel('Color value (hex, rgb, hsl, oklch, or name)')
      .filter({ visible: true })
      .first();
    await input.fill('ff7f50');

    await page
      .getByRole('button', { name: /^Add to palette$/ })
      .filter({ visible: true })
      .first()
      .click();

    // The multi-column grid should now show two columns.
    const grid = page.locator('[data-palette-grid="true"]');
    await expect(grid).toBeVisible();
    await expect(grid).toHaveAttribute('data-grid-columns', '2');

    // Open the export "View code" modal. Default format is Tailwind v4 (@theme).
    await page.getByRole('button', { name: /view export code/i }).click();
    const preview = page.locator('pre[data-export-preview="true"]');
    await expect(preview).toBeVisible();

    const text = await preview.innerText();
    // One @theme block (the palette is not split into multiple blocks)...
    expect(text.match(/@theme \{/g)).toHaveLength(1);
    // ...containing two distinct color families - one per palette swatch.
    const families = [...text.matchAll(/--color-([a-z0-9-]+)-500:/g)].map((m) => m[1]);
    expect(families).toHaveLength(2);
    expect(new Set(families).size).toBe(2); // two *different* color names

    // The dialog heading reflects the multi-color palette.
    await expect(page.getByRole('heading', { name: /Export palette/i })).toBeVisible();
  });
});
