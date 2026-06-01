/**
 * Nearest-named-color lookup for the React island.
 *
 * `findByHexSlim` only matches an *exact* hex. For the export family-name
 * prefix we want a real, recognizable name for *any* color, so this module
 * finds the closest entry in `NAMED_COLORS_SLIM` by perceptual OKLab distance
 * (ΔEOK — Euclidean distance in OKLab `(L, a, b)`).
 *
 * Each slim entry's OKLab coordinates are precomputed once at module load
 * (209 conversions); per call we convert the input hex the same way and scan
 * for the minimum distance. Callers (`ShadeTool`) memoize per-hex.
 *
 * Uses the slim list, not the full `named-colors.ts`, to keep the blurb-bearing
 * data out of the island bundle (see CLAUDE.md's data-source split note).
 */
import { toOklch } from '../color/parse';
import { NAMED_COLORS_SLIM } from './named-colors-slim';
import type { Hex } from '../color/types';

interface NamedLab {
  slug: string;
  L: number;
  a: number;
  b: number;
}

/** OKLCH → OKLab cartesian. Achromatic hue (NaN) collapses to a = b = 0. */
function toLab(hex: Hex): { L: number; a: number; b: number } {
  const { l, c, h } = toOklch(hex);
  if (!Number.isFinite(h)) return { L: l, a: 0, b: 0 };
  const rad = (h * Math.PI) / 180;
  return { L: l, a: c * Math.cos(rad), b: c * Math.sin(rad) };
}

// Precomputed once: every slim entry in OKLab space.
const NAMED_LAB: NamedLab[] = NAMED_COLORS_SLIM.map((entry) => {
  const { L, a, b } = toLab(entry.hex);
  return { slug: entry.slug, L, a, b };
});

/**
 * Slug of the named color closest to `hex` in OKLab space. Returns `'brand'`
 * only if the named list is empty (never in practice).
 */
export function nearestNamedSlug(hex: Hex): string {
  const { L, a, b } = toLab(hex);
  let bestSlug = 'brand';
  let bestDist = Infinity;
  for (const entry of NAMED_LAB) {
    const dL = entry.L - L;
    const da = entry.a - a;
    const db = entry.b - b;
    const dist = dL * dL + da * da + db * db;
    if (dist < bestDist) {
      bestDist = dist;
      bestSlug = entry.slug;
    }
  }
  return bestSlug;
}
