import { test, expect, type Page } from '@playwright/test';

/**
 * Multi-color palette export coverage.
 *
 * Two concerns:
 *  1. Once a color is added the shade view becomes a column-per-color grid, and
 *     the export must emit EVERY palette color (the original bug only exported
 *     the active one). The FIRST "Add to palette" auto-seeds the conventional
 *     design-token roles (Neutral/Success/Warning/Error - see
 *     `DEFAULT_PALETTE_EXTRAS`), so a single color opens as FIVE columns and a
 *     two-color palette opens as SIX: Primary + Accent 1 + the four seeded
 *     roles.
 *  2. The export is TWO-TIER. Tier-1 primitive ramps (`--color-<name>-50…950`)
 *     are keyed by each swatch's own COLOR name (nearest-named slug). Tier-2
 *     semantic aliases (`--color-<role>`, `--color-<role>-hover`,
 *     `--color-<role>-surface`, …) are keyed by the swatch's semantic role (the
 *     user's rename, else the positional default / seeded role) and `var()`-point
 *     back at the primitives. A rename flows through to the SEMANTIC tier names.
 */

/** Seed the default two-color palette (#4040ff + #ff7f50), which auto-expands to
 *  the six-column grid. Returns once the grid is visible. */
async function seedTwoColorPalette(page: Page) {
  await page.goto('/4040ff');

  // The tray starts empty: add the landing color (#4040ff) - this first add
  // seeds the conventional roles and flips the tray to the column-per-color grid.
  await page
    .getByRole('button', { name: /^Add to palette$/ })
    .filter({ visible: true })
    .first()
    .click();

  // The left rail (with its color input) is dropped once the band is open, so a
  // second brand color is added via the band's "+" control: it inserts a pending
  // column and auto-opens that column's picker. Set it to #ff7f50 as Accent 1.
  await page.getByRole('button', { name: 'Add a color to the palette' }).first().click();
  const dialog = page.locator('[role="dialog"]').filter({ visible: true }).first();
  await expect(dialog).toBeVisible();
  await dialog.locator('select[aria-label="Color value format"]').selectOption('hex');
  await dialog.locator('input[aria-label="HEX color value"]').fill('ff7f50');
  // Commit by clicking outside the picker (Escape would cancel). Re-selecting the
  // already-active "Tailwind" algorithm tab is a side-effect-free outside target.
  await page.getByRole('tab', { name: 'Tailwind' }).first().click();
  await expect(dialog).toBeHidden();

  const grid = page.locator('[data-palette-grid="true"]');
  await expect(grid).toBeVisible();
  // Primary + Accent 1 + Neutral/Success/Warning/Error.
  await expect(grid).toHaveAttribute('data-grid-columns', '6');
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

/** Tier-1 primitive family slugs (`--color-<name>-500:`) in an export preview. */
function familiesIn(text: string): string[] {
  return [...text.matchAll(/--color-([a-z0-9-]+)-500: #/g)].map((m) => m[1]);
}

/** Tier-2 semantic role slugs, read off the one-per-role `--color-<role>-surface:`
 *  alias (the cleanest unique marker for each role - `surface` is always emitted
 *  and, unlike the bare base alias, can't be confused with the other variants). */
function rolesIn(text: string): string[] {
  return [...text.matchAll(/--color-([a-z0-9-]+)-surface: var\(/g)].map((m) => m[1]);
}

test.describe('multi-color palette export', () => {
  // webkit under Playwright is flaky both delivering clicks to the lazy export
  // modal and propagating fill() to React's onChange; real Safari is unaffected.
  // Same class as the other webkit fixmes in tool.spec.ts.
  test.beforeEach(({ browserName }) => {
    test.fixme(browserName === 'webkit', 'webkit lazy-modal / fill() flakiness');
  });

  test('export emits two tiers: a primitive ramp per color + the semantic roles', async ({
    page,
  }) => {
    await seedTwoColorPalette(page);

    const text = await openExportPreview(page);
    // One @theme block (the palette is not split into multiple blocks)...
    expect(text.match(/@theme \{/g)).toHaveLength(1);
    // ...split into the two labelled tiers.
    expect(text).toContain('/* primitives */');
    expect(text).toContain('/* semantic */');

    // Tier 1: one primitive ramp per swatch, keyed by its own color name - six
    // distinct families (the two brand colors + the four seeded roles).
    const families = familiesIn(text);
    expect(new Set(families).size).toBe(6);

    // Tier 2: the semantic roles - the two brand colors as Primary/Secondary plus
    // the four seeded design-token roles - each aliasing a primitive via var().
    expect(new Set(rolesIn(text))).toEqual(
      new Set(['primary', 'secondary', 'neutral', 'success', 'warning', 'error']),
    );
    expect(text).toMatch(/--color-primary: var\(--color-[a-z0-9-]+-\d+\);/);

    // The dialog's accessible name reflects the multi-color palette (the visible
    // heading was replaced by the format pill row; the name lives on aria-label).
    await expect(page.getByRole('dialog', { name: /Export palette/i })).toBeVisible();
  });

  test('renaming a swatch flows through to the semantic-tier role names', async ({ page }) => {
    await seedTwoColorPalette(page);

    // Rename the Secondary swatch to "CTA" via the band's inline pencil editor.
    // (Renaming the *first* brand color instead would reflow the positional
    // default - the next un-named swatch would inherit "Primary" - so we target
    // Secondary, which leaves slot 0's "Primary" default untouched.)
    await page
      .getByRole('button', { name: 'Rename the Secondary role' })
      .filter({ visible: true })
      .first()
      .click();
    const editor = page
      .getByRole('textbox', { name: /Semantic name for/ })
      .filter({ visible: true })
      .first();
    await editor.fill('CTA');
    await editor.press('Enter');

    const roles = new Set(rolesIn(await openExportPreview(page)));
    // The renamed role appears in the semantic tier (sanitized to a CSS-safe slug)...
    expect(roles).toContain('cta');
    // ...replacing the old positional default, while the untouched Primary stays.
    expect(roles).not.toContain('secondary');
    expect(roles).toContain('primary');
  });
});
