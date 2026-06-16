/**
 * OKLCH-based continuous ramp (default mode).
 *
 * Convention: 11 inner stepped shades at equal OKLCH lightness spacing
 * between L_TOP and L_BOTTOM. No literal `#ffffff` / `#000000` endpoints;
 * the dark floor is set to the Tailwind 950 anchor (L≈0.205) so the darkest
 * shade keeps visible hue rather than collapsing to near-black. The count
 * mirrors the Tailwind scale's 11 stops so the two views are an
 * apples-to-apples "same scale, two algorithms" pair, and the export keys
 * the ramp to the same 50…950 stop labels (see `rampToTokens`).
 *
 * Input is pinned at the inner-step index whose target L is closest to
 * the input's measured OKLCH L. At that index, we use the input hex
 * verbatim and the input's own measured OKLCH (so hex and oklch agree).
 *
 * Chroma bell curve: 1.0 at L=0.5, ~0.3 at L=0 or L=1. Smooth parabola
 * `0.3 + 0.7 * (1 - 4 * (L - 0.5)^2)`. Prevents washed-out clipping at
 * the lightness extremes where the sRGB gamut is narrow.
 *
 * Chroma is normalized **relative to the input's snap step**, the same as
 * the Tailwind scale (`scale.ts`): the input's measured chroma is treated
 * as the bell value at its own lightness, and every other step scales by
 * the ratio of bell multipliers. Without this, a low-chroma input (a light
 * pastel, a near-white) would only ever scale its already-tiny chroma
 * *down*, so the whole ramp collapsed to muddy grays whose dark end was
 * indistinguishable. Normalizing lets a desaturated input still produce a
 * ramp with readable hue through the mid/dark stops.
 */

import { oklchToHex, toOklch } from './parse';
import type { ContinuousRamp, Hex, OKLCH, Shade } from './types';

const INNER_STEPS = 11;
const L_TOP = 0.97; // L of the lightest inner step (achromatic → #f5f5f5). Kept close to white so very light inputs (a pastel at L≈0.93) still snap *below* the top step and leave a lighter tint above them, instead of pinning to index 0 with nothing lighter.
const L_BOTTOM = 0.205; // L of the darkest inner step, matched to the Tailwind 950 anchor (achromatic → #171717) so the darkest shade keeps visible hue instead of collapsing to near-black

function chromaBellMultiplier(l: number): number {
  // 1.0 at L=0.5, 0.3 at L=0 or L=1, smooth quadratic between.
  return 0.3 + 0.7 * (1 - 4 * (l - 0.5) ** 2);
}

function innerStepLs(): number[] {
  // Evenly spaced from L_TOP down to L_BOTTOM, lightest first.
  const out: number[] = [];
  const span = L_TOP - L_BOTTOM;
  for (let i = 0; i < INNER_STEPS; i++) {
    out.push(L_TOP - (span * i) / (INNER_STEPS - 1));
  }
  return out;
}

function nearestIndex(target: number, values: readonly number[]): number {
  let best = 0;
  let bestDiff = Infinity;
  for (let i = 0; i < values.length; i++) {
    const d = Math.abs(values[i] - target);
    if (d < bestDiff) {
      bestDiff = d;
      best = i;
    }
  }
  return best;
}

/**
 * Build an 11-shade OKLCH continuous ramp from a canonical hex input.
 *
 * The input hex appears verbatim at the inner step whose target L is
 * closest to the input's measured L. `inputIndex` points to that entry
 * in the returned `shades` array (range [0, 10]).
 */
export function oklchRamp(input: Hex): ContinuousRamp {
  const inputOklch: OKLCH = toOklch(input);
  const stepLs = innerStepLs();

  // Hue: preserve input's hue. Achromatic inputs get NaN; the underlying
  // chroma will be ~0 there so hue doesn't matter for the rendered ramp.
  const h = inputOklch.h;
  const hForCompute = Number.isFinite(h) ? h : 0;
  const inputC = inputOklch.c;

  // Find the inner step closest to the input's L. If the input is exactly
  // white or black we still snap to an inner step and reproduce the input
  // hex literally there.
  const snapInner = nearestIndex(inputOklch.l, stepLs);

  // Treat the input's chroma as the bell value at *its own* snapped L, then
  // scale every other step by the ratio of bell multipliers. This mirrors
  // the Tailwind scale's `inputC * cMul / anchorCMul` normalization, so a
  // desaturated input (light pastel / near-white) still yields vivid mids
  // and a hue-bearing dark end rather than a stack of muddy grays.
  const anchorMul = chromaBellMultiplier(stepLs[snapInner]);

  const shades: Shade[] = stepLs.map((l, i) => {
    if (i === snapInner) {
      return { hex: input, oklch: inputOklch, isInput: true };
    }
    const cMul = chromaBellMultiplier(l);
    const c = anchorMul > 0 ? (inputC * cMul) / anchorMul : inputC * cMul;
    const oklch: OKLCH = { l, c, h: Number.isFinite(h) ? h : NaN };
    const hex = oklchToHex({ l, c, h: hForCompute });
    return { hex, oklch };
  });

  return { mode: 'oklch', shades, inputIndex: snapInner };
}
