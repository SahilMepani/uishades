/**
 * Shared export-token layer.
 *
 * The five serializers in this directory used to take a `TailwindScale` and
 * key their output off `s.stop`. To also export the OKLCH ramp (which has no
 * stops, only a 1..20 step index) we normalize BOTH palette shapes into a
 * flat `ColorToken[]` here, and let serializers code against that.
 *
 * `tokenValue` renders a token as either a hex string or an `oklch()` string.
 * The oklch() form is derived from the *rendered hex* (via the same
 * `formatForCopy` the per-row "copy as OKLCH" uses), NOT from the ramp's
 * pre-clamp target OKLCH — so exports never emit out-of-gamut values and stay
 * consistent with what the UI shows.
 */

import type { ContinuousRamp, Hex, OKLCH, TailwindScale } from '../color/types';
import { formatForCopy } from '../color/format';

export interface ColorToken {
  /** Token name suffix: '50'..'950' for the scale, '1'..'20' for the ramp. */
  key: string;
  hex: Hex;
  oklch: OKLCH;
}

/**
 * One named color family in an export. A single-color export is just one group;
 * a multi-color palette is one group per swatch, each with its own brand name
 * and its own `ColorToken[]` (scale or ramp). The five serializers all code
 * against `ColorGroup[]` so the same code path handles one color or eight.
 */
export interface ColorGroup {
  /** Brand name for this family - sanitized to a slug by each serializer. */
  name: string;
  tokens: ColorToken[];
}

export type ValueMode = 'hex' | 'oklch';

/**
 * Brand-name → CSS-safe slug. Lowercase, non-alphanumerics collapsed to
 * hyphens, leading/trailing hyphens stripped, empty → 'brand'. Single source
 * of truth (previously duplicated in all five serializers).
 */
export function sanitizeName(name: string): string {
  const cleaned = (name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned || 'brand';
}

/** Tailwind 11-stop scale → tokens keyed by stop number. */
export function scaleToTokens(scale: TailwindScale): ColorToken[] {
  return scale.shades.map((s) => ({
    key: String(s.stop),
    hex: s.hex,
    oklch: s.oklch,
  }));
}

/** OKLCH 20-step ramp → tokens keyed by 1-based step index, lightest first. */
export function rampToTokens(ramp: ContinuousRamp): ColorToken[] {
  return ramp.shades.map((s, i) => ({
    key: String(i + 1),
    hex: s.hex,
    oklch: s.oklch,
  }));
}

/** Render a token's value in the requested mode. */
export function tokenValue(t: ColorToken, mode: ValueMode): string {
  return mode === 'oklch' ? formatForCopy(t.hex, 'oklch') : t.hex;
}

/**
 * Make every group's *sanitized* name unique so a multi-color export can never
 * collide. Two palette swatches that resolve to the same nearest-named slug
 * (e.g. two blues both → `royalblue`) would otherwise emit duplicate
 * `--color-royalblue-50` lines and - worse - silently overwrite each other in
 * the JSON exports (object keys). The first occurrence keeps its slug;
 * subsequent ones get `-2`, `-3`, … The returned names are already sanitized,
 * and `sanitizeName` is idempotent, so re-sanitizing in a serializer is a no-op.
 */
export function dedupeGroupNames(groups: ColorGroup[]): ColorGroup[] {
  const used = new Set<string>();
  return groups.map((g) => {
    let slug = sanitizeName(g.name);
    if (used.has(slug)) {
      let i = 2;
      while (used.has(`${slug}-${i}`)) i++;
      slug = `${slug}-${i}`;
    }
    used.add(slug);
    return { name: slug, tokens: g.tokens };
  });
}
