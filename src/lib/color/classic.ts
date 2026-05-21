/**
 * Classic 0to255-style RGB-walk algorithm.
 *
 * Reverse-engineered from 0to255's pre-paywall output. The simple "increment
 * every sub-255 channel by 17" rule for the lighter direction comes straight
 * from the plan; the darker direction is more subtle because the reference
 * output for #4040ff shows the B=255 channel being held fixed while R and G
 * walk to zero, then a single residual carry transferring a few units to B
 * before B itself starts dropping by 17 per step.
 *
 * Concretely the rule we implement (and which matches the reference list
 * verbatim) is:
 *
 *  Lighter walk:
 *    Each step, increment every channel whose value is currently below 255
 *    by 17. Cap at 255 (any overshoot is discarded — no carry). Stop when
 *    all three channels are 255. Append `#ffffff` as the final lightest
 *    shade if it wasn't reached exactly.
 *
 *  Darker walk:
 *    Let M = max(R, G, B) at the input. "Low" channels are those < M; "high"
 *    channels are those = M. While any low channel is > 0:
 *      - drop = min(17, smallest_nonzero_low_value)
 *      - subtract `drop` from every low channel (flooring at 0)
 *      - residual = 17 - drop
 *      - subtract `residual` from every high channel (flooring at 0)
 *    After all low channels reach zero, switch to phase 2: subtract 17 from
 *    each currently non-zero channel each step until all are 0. Append
 *    `#000000` as the final darkest shade.
 *
 *  Edge cases:
 *    - Input has no "low" channels (e.g., `#ff0000`, where the only non-zero
 *      channel is already at max, or grayscale where all channels equal):
 *      skip phase 1 entirely and go straight to phase 2.
 *    - Input is `#ffffff`: lighter walk is empty; darker walk steps every
 *      channel down by 17 each step (grayscale ramp).
 *    - Input is `#000000`: lighter walk steps every channel up by 17 each
 *      step (grayscale ramp); darker walk is empty.
 */

import { parseColor, toOklch } from './parse';
import type { ContinuousRamp, Hex, Shade } from './types';

const STEP = 17;

interface RGB {
  r: number;
  g: number;
  b: number;
}

function hexToRgb(hex: Hex): RGB {
  // hex is canonical `#rrggbb` (lowercase, 7 chars). Direct integer parse is
  // both faster and round-trip-stable than going through culori for this.
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

function rgbToHex({ r, g, b }: RGB): Hex {
  const h = (n: number) => n.toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}` as Hex;
}

function clamp(v: number): number {
  return Math.max(0, Math.min(255, v));
}

function rgbEqual(a: RGB, b: RGB): boolean {
  return a.r === b.r && a.g === b.g && a.b === b.b;
}

function shadeOf(rgb: RGB): Shade {
  const hex = rgbToHex(rgb);
  return { hex, oklch: toOklch(hex) };
}

function lighterWalk(input: RGB): RGB[] {
  // produces steps strictly lighter than `input` (does not include input
  // itself), ordered darkest-of-the-lighter-set first up to white.
  const out: RGB[] = [];
  let cur = { ...input };
  while (!(cur.r === 255 && cur.g === 255 && cur.b === 255)) {
    cur = {
      r: cur.r < 255 ? clamp(cur.r + STEP) : 255,
      g: cur.g < 255 ? clamp(cur.g + STEP) : 255,
      b: cur.b < 255 ? clamp(cur.b + STEP) : 255,
    };
    out.push(cur);
  }
  // Guarantee #ffffff is the last entry. The loop above always exits with
  // (255,255,255) so it's already there.
  return out;
}

function darkerWalk(input: RGB): RGB[] {
  // produces steps strictly darker than `input`, ordered closest-to-input
  // first down to black.
  const out: RGB[] = [];
  const M = Math.max(input.r, input.g, input.b);
  const isLow = { r: input.r < M, g: input.g < M, b: input.b < M };
  const isHigh = { r: input.r === M, g: input.g === M, b: input.b === M };

  let cur = { ...input };

  // Phase 1: drop low channels in sync (so they reach zero together when
  // they started at the same value). Residual from the transition carries
  // to high channels.
  while (true) {
    const lows: number[] = [];
    if (isLow.r && cur.r > 0) lows.push(cur.r);
    if (isLow.g && cur.g > 0) lows.push(cur.g);
    if (isLow.b && cur.b > 0) lows.push(cur.b);
    if (lows.length === 0) break;

    const minLow = Math.min(...lows);
    const drop = Math.min(STEP, minLow);
    const residual = STEP - drop;

    const next: RGB = { ...cur };
    if (isLow.r && next.r > 0) next.r = clamp(next.r - drop);
    if (isLow.g && next.g > 0) next.g = clamp(next.g - drop);
    if (isLow.b && next.b > 0) next.b = clamp(next.b - drop);
    if (residual > 0) {
      if (isHigh.r) next.r = clamp(next.r - residual);
      if (isHigh.g) next.g = clamp(next.g - residual);
      if (isHigh.b) next.b = clamp(next.b - residual);
    }
    cur = next;
    out.push(cur);
  }

  // Phase 2: drop every non-zero channel by STEP each iteration.
  while (cur.r > 0 || cur.g > 0 || cur.b > 0) {
    cur = {
      r: clamp(cur.r - STEP),
      g: clamp(cur.g - STEP),
      b: clamp(cur.b - STEP),
    };
    out.push(cur);
  }

  return out;
}

/**
 * Build the Classic continuous ramp for a hex input. Result is lightest
 * first, with `#ffffff` and `#000000` as the endpoints (deduplicated when
 * the input itself is one of them) and the input hex appearing verbatim
 * at `inputIndex`.
 */
export function classicRamp(input: Hex): ContinuousRamp {
  const inputHex = parseColor(input); // normalize & validate
  const inputRgb = hexToRgb(inputHex);

  const lighterStrict = lighterWalk(inputRgb); // ends at white
  const darkerStrict = darkerWalk(inputRgb); // ends at black

  // Compose: [whitest..just-above-input] + [input] + [just-below-input..black]
  // `lighterStrict` is currently ordered darkest-lighter first, so reverse it.
  const lighter = [...lighterStrict].reverse();

  const rgbList: RGB[] = [...lighter, inputRgb, ...darkerStrict];

  // Deduplicate adjacent equal entries -- this handles the case where the
  // input is exactly white or black (input would otherwise duplicate the
  // endpoint), and any pathological where a step lands precisely on input.
  const deduped: RGB[] = [];
  for (const c of rgbList) {
    const prev = deduped[deduped.length - 1];
    if (!prev || !rgbEqual(prev, c)) deduped.push(c);
  }

  // Locate inputIndex AFTER dedup (input is preserved; if it equals an
  // endpoint, we want that endpoint to be marked as the input).
  let inputIndex = -1;
  for (let i = 0; i < deduped.length; i++) {
    if (rgbEqual(deduped[i], inputRgb)) {
      inputIndex = i;
      break;
    }
  }

  const shades: Shade[] = deduped.map((rgb, i) => {
    const s = shadeOf(rgb);
    if (i === inputIndex) s.isInput = true;
    return s;
  });

  return { mode: 'classic', shades, inputIndex };
}
