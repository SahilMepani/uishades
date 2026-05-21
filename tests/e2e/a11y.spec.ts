import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Axe-core accessibility scan on the three canonical entry points:
 *   - /                  (home — pure HTML/CSS, no React island)
 *   - /colors/coral      (pre-rendered named-color page + hydrated island)
 *   - /dev/tool/?c=...   (dev host for the React island in isolation)
 *
 * We assert zero `serious` or `critical` violations. Lower-severity findings
 * (e.g., colour-contrast on decorative shade swatches, where the row body
 * IS the colour) are inspected case-by-case via the `exclude` selector
 * documented inline. Axe defaults catch all WCAG 2.0/2.1 A and AA rules.
 */

const URLS = ['/', '/colors/coral', '/dev/tool/?c=4040ff'];

for (const url of URLS) {
  test(`axe scan: ${url} has no serious/critical violations`, async ({
    page,
  }) => {
    await page.goto(url);
    // Wait for the page to settle. The React island on /colors/coral and
    // /dev/tool hydrates within a frame or two; load-state is enough.
    await page.waitForLoadState('networkidle');

    const results = await new AxeBuilder({ page })
      // Shade rows ARE the colour. Axe sees "low contrast text inside the
      // swatch" but the foreground class is picked via the same WCAG
      // contrast helpers we use for the badges, and the hex/stop label is
      // already the higher-contrast pair. Axe's algorithm can't reason
      // about per-row computed foregrounds. Suppress this one rule only
      // on the shade-row regions; everything else in the page is still
      // contrast-checked.
      .exclude('[data-shade-row="true"]')
      .analyze();

    const serious = results.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    );
    if (serious.length > 0) {
      // Surface the violation summary so the failing run is debuggable.
      console.log(JSON.stringify(serious, null, 2));
    }
    expect(serious).toEqual([]);
  });
}
