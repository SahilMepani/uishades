/**
 * OKLCH-based continuous ramp (default mode).
 *
 * Convention: 20 inner stepped shades at equal OKLCH lightness spacing
 * between L_TOP and L_BOTTOM. No literal `#ffffff` / `#000000` endpoints.
 *
 * Input is pinned at the inner-step index whose target L is closest to
 * the input's measured OKLCH L. At that index, we use the input hex
 * verbatim and the input's own measured OKLCH (so hex and oklch agree).
 *
 * Chroma bell curve: 1.0 at L=0.5, ~0.3 at L=0 or L=1. Smooth parabola
 * `0.3 + 0.7 * (1 - 4 * (L - 0.5)^2)`. Prevents washed-out clipping at
 * the lightness extremes where the sRGB gamut is narrow.
 */

import { oklchToHex, toOklch } from './parse';
import type { ContinuousRamp, Hex, OKLCH, Shade } from './types';

const INNER_STEPS = 20;
const L_TOP = 0.95; // L of the lightest inner step (achromatic → #eeeeee)
const L_BOTTOM = 0.06; // L of the darkest inner step (achromatic → #010101 — keeps c=0 inputs off pure black)

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
 * Build a 20-shade OKLCH continuous ramp from a canonical hex input.
 *
 * The input hex appears verbatim at the inner step whose target L is
 * closest to the input's measured L. `inputIndex` points to that entry
 * in the returned `shades` array (range [0, 19]).
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

  const shades: Shade[] = stepLs.map((l, i) => {
    if (i === snapInner) {
      return { hex: input, oklch: inputOklch, isInput: true };
    }
    const cMul = chromaBellMultiplier(l);
    const c = inputC * cMul;
    const oklch: OKLCH = { l, c, h: Number.isFinite(h) ? h : NaN };
    const hex = oklchToHex({ l, c, h: hForCompute });
    return { hex, oklch };
  });

  return { mode: 'oklch', shades, inputIndex: snapInner };
}
