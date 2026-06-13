import { test, expect, type Page } from '@playwright/test';

/**
 * Multi-color palette export coverage.
 *
 * Two concerns:
 *  1. Once a color is added the shade view becomes a column-per-color grid, and
 *     the export must emit EVERY palette color (the original bug only exported
 *     the active one). The FIRST "Add to palette" auto-seeds the conventional
 *     design-token roles (Background/Neutral/Success/Warning/Error - see
 *     `DEFAULT_PALETTE_EXTRAS`), so a single color opens as SIX columns and a
 *     two-color palette opens as SEVEN: Primary + Accent 1 + the five seeded
 *     roles.
 *  2. Export token FAMILY names come from each swatch's semantic name (the
 *     user's rename, else the positional default / seeded role), not the
 *     nearest-color slug - so the band header, the copied tokens, and the
 *     exported file all read the same name, and a rename flows through to the
 *     exported `--color-<name>-…` tokens.
 */

/** Seed the default two-color palette (#4040ff + #ff7f50), which auto-expands to
 *  the seven-column grid. Returns once the grid is visible. */
async function seedTwoColorPalette(page: Page) {
  await page.goto('/4040ff');

  // The tray starts empty: add the landing color (#4040ff) - this first add
  // seeds the conventional roles and flips the tray to the column-per-color grid.
  const addToPalette = page
    .getByRole('button', { name: /^Add to palette$/ })
    .filter({ visible: true })
    .first();
  await addToPalette.click();

  // Change the active color to a clearly different hue, then add it as Accent 1.
  const input = page
    .getByLabel('Color value (hex, rgb, hsl, oklch, or name)')
    .filter({ visible: true })
    .first();
  await input.fill('ff7f50');
  await addToPalette.click();

  const grid = page.locator('[data-palette-grid="true"]');
  await expect(grid).toBeVisible();
  // Primary + Accent 1 + Background/Neutral/Success/Warning/Error.
  await expect(grid).toHaveAttribute('data-grid-columns', '7');
}

/** Open the export modal and return its preview text (default format: Tailwind v4). */
async function openExportPreview(page: Page): Promise<string> {
  await page
    .getByRole('button', { name: /open export options/i })
    .filter({ visible: true })
    .first()
    .click();
  const preview = page.locator('pre[data-export-preview="true"]');
  await expect(preview).toBeVisible();
  return preview.innerText();
}

/** Family slugs (`--color-<name>-500:`) present in an export preview. */
function familiesIn(text: string): string[] {
  return [...text.matchAll(/--color-([a-z0-9-]+)-500:/g)].map((m) => m[1]);
}

test.describe('multi-color palette export', () => {
  // webkit under Playwright is flaky both delivering clicks to the lazy export
  // modal and propagating fill() to React's onChange; real Safari is unaffected.
  // Same class as the other webkit fixmes in tool.spec.ts.
  test.beforeEach(({ browserName }) => {
    test.fixme(browserName === 'webkit', 'webkit lazy-modal / fill() flakiness');
  });

  test('export emits every palette color, each with its semantic family name', async ({
    page,
  }) => {
    await seedTwoColorPalette(page);

    const text = await openExportPreview(page);
    // One @theme block (the palette is not split into multiple blocks)...
    expect(text.match(/@theme \{/g)).toHaveLength(1);
    // ...containing one family per swatch, named by its semantic role - the two
    // brand colors as Primary/Accent 1, plus the five seeded design-token roles.
    expect(new Set(familiesIn(text))).toEqual(
      new Set(['primary', 'accent-1', 'background', 'neutral', 'success', 'warning', 'error']),
    );

    // The dialog heading reflects the multi-color palette.
    await expect(page.getByRole('heading', { name: /Export palette/i })).toBeVisible();
  });

  test('renaming a swatch flows through to the exported token names', async ({ page }) => {
    await seedTwoColorPalette(page);

    // Rename the Accent 1 swatch to "CTA" via the band's inline pencil editor.
    // (Renaming the *first* brand color instead would reflow the positional
    // default - the next un-named swatch would inherit "Primary" - so we target
    // Accent 1, which leaves slot 0's "Primary" default untouched.)
    await page
      .getByRole('button', { name: 'Rename the Accent 1 role' })
      .filter({ visible: true })
      .first()
      .click();
    const editor = page
      .getByRole('textbox', { name: /Semantic name for/ })
      .filter({ visible: true })
      .first();
    await editor.fill('CTA');
    await editor.press('Enter');

    const families = new Set(familiesIn(await openExportPreview(page)));
    // The renamed family appears (sanitized to a CSS-safe slug)...
    expect(families).toContain('cta');
    // ...replacing the old positional default, while the untouched Primary stays.
    expect(families).not.toContain('accent-1');
    expect(families).toContain('primary');
  });
});
