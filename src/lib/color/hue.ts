/**
 * OKLCH hue bucketing for the /explore "filter by color" facet.
 *
 * Snaps a color's OKLCH hue to one of 12 ~30° families (buckets 0..11), so a
 * picked filter color and a stored palette color match when they share a family
 * - an indexed integer compare in SQLite instead of per-row ΔE math. Achromatic
 * colors (chroma below `ACHROMATIC_CHROMA`) have no meaningful hue and return
 * `null` so grays never match a hue filter (and store as NULL in `hue_bucket`).
 */
import { toOklch } from './parse';
import type { Hex } from './types';

/** Number of ~30° hue families (360 / 12). */
export const HUE_BUCKETS = 12;

/**
 * Below this OKLCH chroma a color reads as a neutral/gray with no stable hue;
 * culori also reports `h: NaN` for true achromatics. ~0.03 keeps near-grays out
 * of the color filter without swallowing genuinely muted-but-tinted colors.
 */
export const ACHROMATIC_CHROMA = 0.03;

/**
 * Map a canonical `Hex` to its hue bucket (0..11), or `null` when achromatic.
 * Bucket `b` covers hues `[b*30 - 15, b*30 + 15)`; bucket 0 straddles 0°/360°.
 */
export function hueBucket(hex: Hex): number | null {
  const { c, h } = toOklch(hex);
  if (c < ACHROMATIC_CHROMA || !Number.isFinite(h)) return null;
  // Offset by half a bucket so each 30° family is centered on a multiple of 30°.
  const normalized = ((h % 360) + 360) % 360;
  return Math.floor(((normalized + 15) % 360) / 30);
}
