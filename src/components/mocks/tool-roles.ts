/**
 * Neutral-shell role mapping for the **public shade tool** preview.
 *
 * Unlike `PaletteEditor`'s positional full-role spread (`[0]→bg, [1]→surface,
 * [2]→accent, [3]→text, …` — see `vars.ts`), the main tool is single-color
 * centric: a visitor lands on one brand color and wants to see *that color* in a
 * real UI without it being swallowed by the page background. So we pin a neutral
 * app shell (white `bg`, a faint `#f5f5f5` `surface`, and — via `resolveRoles`
 * defaults — a near-black `text`) and route every palette color into `accent`
 * (the first) plus `extra` (the rest, which `computeMockVars` folds into the
 * chart series / chips). The brand color drives primary buttons, links, and
 * focus rings; the shell stays neutral no matter how many colors are added.
 *
 * Pure and dependency-light so it unit-tests in isolation and the result feeds
 * straight into the existing `computeMockVars`.
 */
import type { MockColorInput } from './types';
import type { Hex } from '../../lib/color/types';

/** Faint paper tone for cards/inputs/secondary buttons — distinct from white bg. */
const NEUTRAL_SURFACE = '#f5f5f5';

/**
 * Map the tool's current color (+ any tray colors) to the mock layer's inputs.
 * `bg` and `text` are left for `resolveRoles` to default (white / readable),
 * keeping the shell neutral; the brand color(s) become accent + extras.
 */
export function mockColorsForTool(hexes: Hex[]): MockColorInput[] {
  if (hexes.length === 0) return [];
  return [
    { hex: hexes[0], role: 'accent' },
    { hex: NEUTRAL_SURFACE, role: 'surface' },
    ...hexes.slice(1).map((h) => ({ hex: h, role: 'extra' as const })),
  ];
}
