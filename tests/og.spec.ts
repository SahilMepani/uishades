/**
 * OG strip-index bounds (regression for the dark-color 500).
 *
 * `renderOgImage` itself needs the Workers/Satori runtime, so we test the pure
 * index selection it delegates to (`ogStripIndices`) plus its interaction with
 * real `oklchRamp` output. Pre-fix, the two darker indices clamped at a literal
 * 20 instead of `count - 1`, so a dark input (high `inputIndex`) produced index
 * 20 into a 20-element array → `ramp.shades[20].hex` threw → the OG endpoints
 * 500'd for every dark color.
 */
import { describe, it, expect } from 'vitest';
import { ogStripIndices } from '../src/lib/og-strip';
import { oklchRamp } from '../src/lib/color/ramp';
import { parseColor } from '../src/lib/color/parse';

const COUNT = 20; // oklchRamp always emits 20 inner shades (INNER_STEPS)

describe('ogStripIndices', () => {
  it('returns only in-range indices for every possible inputIndex', () => {
    for (let ix = 0; ix < COUNT; ix++) {
      for (const i of ogStripIndices(ix, COUNT)) {
        expect(i, `ix=${ix} -> out-of-range ${i}`).toBeGreaterThanOrEqual(0);
        expect(i, `ix=${ix} -> out-of-range ${i}`).toBeLessThanOrEqual(COUNT - 1);
      }
    }
  });

  it('regression: high ix (dark colors) never reaches index 20', () => {
    // ceil(ix + (21 - ix) * 0.75) used to hit 20 for ix >= 14.
    for (let ix = 14; ix < COUNT; ix++) {
      expect(Math.max(...ogStripIndices(ix, COUNT))).toBeLessThanOrEqual(COUNT - 1);
    }
  });

  it('includes the input index itself in the strip', () => {
    expect(ogStripIndices(7, COUNT)).toContain(7);
  });
});

describe('OG strip against real dark-color ramps', () => {
  for (const hex of ['#000000', '#000080', '#1a1a2e', '#2d0a31', '#0b3d2e']) {
    it(`every index resolves to a real shade for ${hex}`, () => {
      const ramp = oklchRamp(parseColor(hex));
      for (const i of ogStripIndices(ramp.inputIndex, ramp.shades.length)) {
        expect(ramp.shades[i], `shade ${i} for ${hex}`).toBeDefined();
        expect(ramp.shades[i].hex).toMatch(/^#[0-9a-f]{6}$/);
      }
    });
  }
});
