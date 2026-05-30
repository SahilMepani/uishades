/**
 * Tailwind-style 11-stop scale builder.
 *
 * Pipeline (per the plan):
 *   1. Convert input hex to OKLCH.
 *   2. Snap input's L to the nearest stop's anchor L; that becomes the
 *      `anchorStop` returned in the TailwindScale.
 *   3. For each stop, set L = ANCHORS[stop].l and C = inputC *
 *      ANCHORS[stop].cMul / ANCHORS[anchorStop].cMul. Hue is preserved
 *      from the input.
 *   4. The anchor stop uses the input hex verbatim (and the input's
 *      measured OKLCH) so the user's exact color survives the round trip.
 *   5. All non-anchor stops are gamut-mapped to sRGB via culori's
 *      `toGamut('rgb', 'oklch')` (chroma binary-search, CSS Color 4).
 */

import { oklchToHex, toOklch } from './parse';
import { ANCHORS, STOPS, type Stop } from './anchors';
import type { Hex, OKLCH, Shade, TailwindScale } from './types';

function snapStop(inputL: number): Stop {
  let best: Stop = 500;
  let bestDiff = Infinity;
  for (const stop of STOPS) {
    const d = Math.abs(ANCHORS[stop].l - inputL);
    if (d < bestDiff) {
      bestDiff = d;
      best = stop;
    }
  }
  return best;
}

export function buildScale(input: Hex): TailwindScale {
  const inputOklch: OKLCH = toOklch(input);
  const anchorStop = snapStop(inputOklch.l);
  const anchorCMul = ANCHORS[anchorStop].cMul;

  const inputC = inputOklch.c;
  const inputH = inputOklch.h;
  const hForCompute = Number.isFinite(inputH) ? inputH : 0;

  const shades: Shade[] = STOPS.map(stop => {
    if (stop === anchorStop) {
      return {
        hex: input,
        oklch: inputOklch,
        stop,
        isInput: true,
      };
    }
    const { l, cMul } = ANCHORS[stop];
    // Avoid divide-by-zero on the (currently impossible) anchorCMul=0 row.
    const c = anchorCMul > 0 ? (inputC * cMul) / anchorCMul : 0;
    const oklch: OKLCH = { l, c, h: Number.isFinite(inputH) ? inputH : NaN };
    const hex = oklchToHex({ l, c, h: hForCompute });
    return { hex, oklch, stop };
  });

  return { shades, anchorStop };
}
