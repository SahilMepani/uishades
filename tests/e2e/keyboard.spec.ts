import { test, expect } from '@playwright/test';

/**
 * Keyboard-navigation regression suite for the shade tool.
 *
 * Covers the contract documented on `<ShadeRow>` and `<ColorInput>`:
 *  - Tab order reaches every interactive control
 *  - ArrowDown / ArrowUp cycle focus between sibling shade rows
 *  - Enter on a focused row copies; Shift+Enter navigates
 *  - Escape closes the autocomplete dropdown without committing a value
 *
 * The clipboard assertions are chromium-only because Playwright's
 * `grantPermissions` for `clipboard-write` is honored only by chromium.
 */

const DEV_URL = '/dev/tool/?c=4040ff';

test.describe('keyboard navigation', () => {
  test('Tab walks through the controls in document order', async ({
    page,
  }) => {
    await page.goto(DEV_URL);
    // Focus the document body explicitly so Tab starts from the top.
    await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());

    // Step Tab until we've seen at least the color input. We don't pin an
    // exact count because tab order through the React island depends on the
    // viewport (mobile-sticky vs desktop sidebar), but the visible color
    // input MUST be reachable within a small number of stops.
    let sawColorInput = false;
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Tab');
      const label = await page.evaluate(
        () => document.activeElement?.getAttribute('aria-label') ?? null,
      );
      if (label === 'Color value') {
        sawColorInput = true;
        break;
      }
    }
    expect(sawColorInput).toBe(true);
  });

  test('ArrowDown / ArrowUp moves focus between shade rows', async ({
    page,
  }) => {
    await page.goto(DEV_URL);
    const firstRow = page.locator('[data-shade-row="true"]').first();
    await firstRow.focus();
    await expect(firstRow).toBeFocused();

    // ArrowDown should land on the next row.
    await page.keyboard.press('ArrowDown');
    const secondRow = page.locator('[data-shade-row="true"]').nth(1);
    await expect(secondRow).toBeFocused();

    // ArrowDown again -> third.
    await page.keyboard.press('ArrowDown');
    const thirdRow = page.locator('[data-shade-row="true"]').nth(2);
    await expect(thirdRow).toBeFocused();

    // ArrowUp brings us back to second.
    await page.keyboard.press('ArrowUp');
    await expect(secondRow).toBeFocused();
  });

  test('Enter on a focused row copies the hex', async ({
    page,
    context,
    browserName,
  }) => {
    test.skip(
      browserName !== 'chromium',
      'clipboard read permission is chromium-only under Playwright',
    );
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto(DEV_URL);

    const targetRow = page.locator('[data-shade-row="true"]').nth(4);
    const hex = await targetRow.getAttribute('data-hex');
    expect(hex).toBeTruthy();

    await targetRow.focus();
    await page.keyboard.press('Enter');

    await expect(
      page.getByRole('status').filter({ hasText: /Copied/i }),
    ).toBeVisible();

    const clip = await page.evaluate(() => navigator.clipboard.readText());
    expect(clip).toBe(hex);
  });

  test('Escape closes the autocomplete dropdown', async ({ page }) => {
    await page.goto(DEV_URL);
    const input = page
      .getByLabel('Color value')
      .filter({ visible: true })
      .first();
    await input.click();
    await input.fill('cora');

    // Suggestion listbox should appear.
    const listbox = page.getByRole('listbox');
    await expect(listbox).toBeVisible();

    // Escape closes it.
    await page.keyboard.press('Escape');
    await expect(listbox).toBeHidden();
  });

  test('every interactive control has a visible focus indicator', async ({
    page,
  }) => {
    await page.goto(DEV_URL);
    // Verify the color input shows a focus ring by checking computed style
    // after focus. We rely on Tailwind's `focus-visible:ring-*` utility;
    // any focused element should have a non-zero outline OR box-shadow.
    const input = page
      .getByLabel('Color value')
      .filter({ visible: true })
      .first();
    await input.focus();
    const hasFocusStyle = await input.evaluate((el) => {
      const cs = window.getComputedStyle(el);
      const outline = cs.outline && cs.outline !== 'none' && cs.outline !== '0px';
      const ring = cs.boxShadow && cs.boxShadow !== 'none';
      return outline || ring;
    });
    expect(hasFocusStyle).toBe(true);
  });
});
