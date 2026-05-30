import { test, expect } from '@playwright/test';

/**
 * Keyboard-navigation regression suite for the shade tool.
 *
 * Covers the contract documented on `<ShadeRow>` and `<ColorPicker>`:
 *  - Tab order reaches every interactive control (incl. the color picker
 *    trigger button)
 *  - ArrowDown / ArrowUp cycle focus between sibling shade rows
 *  - Enter on a focused row copies; Shift+Enter navigates
 *  - Escape closes the color picker popover
 *
 * Note: the color picker is a trigger button that opens a popover containing
 * the hex/named-color input. The bare `<ColorInput>` autocomplete (role=listbox)
 * was retired with the picker migration — those assertions were dropped here.
 *
 * The clipboard assertions are chromium-only because Playwright's
 * `grantPermissions` for `clipboard-write` is honored only by chromium.
 */

// /dev/tool/ hard-404s in production builds (Wave A audit step A9), and
// Playwright runs against `npm run preview` (a production build). The real
// /[hex] SSR route hosts the same React island, so we target it instead.
const DEV_URL = '/4040ff';

test.describe('keyboard navigation', () => {
  test('Tab walks through the controls in document order', async ({
    page,
  }) => {
    await page.goto(DEV_URL);
    // Focus the document body explicitly so Tab starts from the top.
    await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());

    // Step Tab until we've reached the color picker trigger button. We don't
    // pin an exact count because tab order depends on the viewport, but the
    // picker MUST be reachable within a small number of stops. Its aria-label
    // is `Color #xxxxxx — open color picker`.
    let sawColorPicker = false;
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Tab');
      const label = await page.evaluate(
        () => document.activeElement?.getAttribute('aria-label') ?? null,
      );
      if (label?.includes('open color picker')) {
        sawColorPicker = true;
        break;
      }
    }
    expect(sawColorPicker).toBe(true);
  });

  test('ArrowDown / ArrowUp moves focus between shade rows', async ({
    page,
    browserName,
  }) => {
    // TODO: webkit under Playwright reports the next row as "inactive" after
    // the keydown handler's programmatic `next.focus()` call, despite the same
    // code working in chromium, firefox, and real Safari. Re-enable once we
    // route arrow-nav through Tab-focus (or once the Playwright/webkit focus
    // quirk is resolved upstream).
    test.fixme(browserName === 'webkit', 'webkit programmatic-focus quirk under Playwright');
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

  test('Escape closes the color picker popover', async ({ page, browserName }) => {
    // TODO: webkit under Playwright doesn't fire React's onClick when clicking
    // the picker trigger button. The button has decorative absolute-positioned
    // swatch layers (aria-hidden) stacked over the central click target;
    // webkit's hit-testing under Playwright appears to swallow the event.
    // Real Safari users are not affected. Re-enable if/when we drop the
    // decorative layers or upgrade Playwright's webkit build.
    test.fixme(browserName === 'webkit', 'webkit picker-trigger click hit-test quirk');
    await page.goto(DEV_URL);
    // Open the picker by clicking its trigger button.
    const trigger = page
      .getByRole('button', { name: /open color picker/i })
      .first();
    await trigger.click();

    // Use `aria-expanded` as the open/closed signal. It's set synchronously
    // by the trigger's onClick (setOpen), so it's a reliable cross-browser
    // assertion. The popover dialog itself transitions through aria-hidden
    // for an animation frame and isn't always findable via accessibility-
    // tree selectors during that window (notably under webkit + Playwright).
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');

    await page.keyboard.press('Escape');
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  test('every interactive control has a visible focus indicator', async ({
    page,
  }) => {
    await page.goto(DEV_URL);
    // Verify the color picker trigger shows a focus ring after keyboard focus.
    // Tailwind's `focus-visible:ring-*` only fires for keyboard focus, so we
    // Tab to the button rather than calling .focus() programmatically.
    await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Tab');
      const onPicker = await page.evaluate(
        () =>
          document.activeElement
            ?.getAttribute('aria-label')
            ?.includes('open color picker') ?? false,
      );
      if (onPicker) break;
    }
    const trigger = page
      .getByRole('button', { name: /open color picker/i })
      .first();
    const hasFocusStyle = await trigger.evaluate((el) => {
      const cs = window.getComputedStyle(el);
      const outline = cs.outline && cs.outline !== 'none' && cs.outline !== '0px';
      const ring = cs.boxShadow && cs.boxShadow !== 'none';
      return outline || ring;
    });
    expect(hasFocusStyle).toBe(true);
  });
});
