/**
 * Shared export-token layer.
 *
 * The five serializers in this directory used to take a `TailwindScale` and
 * key their output off `s.stop`. To also export the OKLCH ramp (which has no
 * `stop` of its own - we key it to the same 50..950 stops by row index) we
 * normalize BOTH palette shapes into a flat `ColorToken[]` here, and let
 * serializers code against that.
 *
 * `tokenValue` renders a token as either a hex string or an `oklch()` string.
 * The oklch() form is derived from the *rendered hex* (via the same
 * `formatForCopy` the per-row "copy as OKLCH" uses), NOT from the ramp's
 * pre-clamp target OKLCH — so exports never emit out-of-gamut values and stay
 * consistent with what the UI shows.
 */

import type { ContinuousRamp, ExportFormat, Hex, OKLCH, TailwindScale } from '../color/types';
import { formatForCopy } from '../color/format';
import { ACHROMATIC_CHROMA } from '../color/hue';
import { STOPS } from '../color/anchors';

export interface ColorToken {
  /** Token name suffix: '50'..'950' (both the scale and the OKLCH ramp). */
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
  /**
   * The swatch's own source OKLCH (NOT derived from `tokens`, whose lightness
   * spans the whole 0..1 ramp and so can't identify the input). Optional;
   * `dedupeGroupNames` uses it to describe a name collision (light/dark,
   * muted/vivid, hue word) instead of a bare numeric suffix. Serializers ignore it.
   */
  source?: OKLCH;
}

export type ValueMode = 'hex' | 'rgb' | 'hsl' | 'oklch';

/**
 * Which export formats honor a non-hex value mode (`rgb()`/`hsl()`/`oklch()`).
 * The W3C and Figma JSON serializers always emit hex by design (see
 * `w3c-tokens.ts` / `figma-vars.ts`), so every non-hex format is inert for them -
 * the "Copy as" picker disables those options when one of these formats is
 * selected. Single source of truth for that capability; keep it in lockstep with
 * which serializers actually consume `valueMode`.
 */
export const EXPORT_SUPPORTS_NON_HEX: Record<ExportFormat, boolean> = {
  'tailwind-v4': true,
  'tailwind-v3': true,
  'css-vars': true,
  'w3c-tokens': false,
  'figma-vars': false,
  'style-dictionary': false,
};

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

/**
 * OKLCH ramp → tokens keyed by the same 50…950 Tailwind stop labels as the
 * scale, lightest first (index 0 → 50, last → 950), so the OKLCH export is a
 * drop-in token scale rather than non-standard `brand-1…N` keys. The ramp is
 * sized to `STOPS.length` (see `INNER_STEPS` in ramp.ts); the `?? i + 1` is a
 * defensive fallback if that ever drifts out of lockstep.
 */
export function rampToTokens(ramp: ContinuousRamp): ColorToken[] {
  return ramp.shades.map((s, i) => ({
    key: String(STOPS[i] ?? i + 1),
    hex: s.hex,
    oklch: s.oklch,
  }));
}

/** Render a token's value in the requested mode (hex / rgb() / hsl() / oklch()). */
export function tokenValue(t: ColorToken, mode: ValueMode): string {
  return mode === 'hex' ? t.hex : formatForCopy(t.hex, mode);
}

/** Below this OKLab-unit spread no axis is a meaningful descriptor for a pair of
 * colliding swatches (two near-identical hexes), so we fall back to a numeric
 * suffix rather than slap on a misleading "light"/"dark". */
const NEGLIGIBLE_DIFF = 0.01;

/**
 * Coarse OKLCH-hue → adjective for the rare collision where two same-named
 * swatches differ mainly in hue. Bands are in OKLCH degrees (not HSL), tuned
 * against pure-sRGB references (red ≈ 29°, yellow ≈ 110°, green ≈ 142°,
 * cyan ≈ 195°, blue ≈ 264°, magenta ≈ 328°). `<` upper bound; wraps at 360.
 */
const HUE_WORDS: ReadonlyArray<{ max: number; word: string }> = [
  { max: 45, word: 'red' },
  { max: 90, word: 'orange' },
  { max: 125, word: 'yellow' },
  { max: 170, word: 'green' },
  { max: 220, word: 'cyan' },
  { max: 295, word: 'blue' },
  { max: 340, word: 'magenta' },
  { max: 360, word: 'pink' },
];

function hueWord(h: number): string {
  const x = ((h % 360) + 360) % 360;
  for (const band of HUE_WORDS) if (x < band.max) return band.word;
  return 'red'; // unreachable: last band's max is 360
}

/**
 * One-word qualifier describing how swatch `d` differs from swatch `o`, picked
 * from whichever OKLCH axis carries the largest *perceptual* difference:
 *   - lightness → `light` (d brighter) / `dark`
 *   - chroma    → `vivid` (d more saturated) / `muted`
 *   - hue       → an absolute hue word (`orange`, `teal`, …) for d's hue
 * Returns null when the two are perceptually indistinguishable (caller then
 * uses a numeric suffix). L and C are compared directly (OKLab units are roughly
 * perceptually uniform); the hue arc is chroma-weighted to the same scale, and
 * only counts when both colors carry real chroma.
 */
function describeVariation(d: OKLCH, o: OKLCH): string | null {
  const dL = d.l - o.l;
  const dC = d.c - o.c;
  const lDiff = Math.abs(dL);
  const cDiff = Math.abs(dC);

  const bothChromatic =
    d.c >= ACHROMATIC_CHROMA &&
    o.c >= ACHROMATIC_CHROMA &&
    Number.isFinite(d.h) &&
    Number.isFinite(o.h);
  // Smallest signed angular gap in (-180, 180], then chord-weighted by chroma.
  const dh = bothChromatic ? (((d.h - o.h) % 360) + 540) % 360 - 180 : 0;
  const hDiff = bothChromatic ? ((d.c + o.c) / 2) * Math.abs(dh) * (Math.PI / 180) : 0;

  const max = Math.max(lDiff, cDiff, hDiff);
  if (max < NEGLIGIBLE_DIFF) return null;
  if (max === lDiff) return dL > 0 ? 'light' : 'dark';
  if (max === cDiff) return dC > 0 ? 'vivid' : 'muted';
  return hueWord(d.h);
}

/**
 * Make every group's *sanitized* name unique so a multi-color export can never
 * collide. Two palette swatches that resolve to the same nearest-named slug
 * (e.g. two blues both → `royalblue`) would otherwise emit duplicate
 * `--color-royalblue-50` lines and - worse - silently overwrite each other in
 * the JSON exports (object keys).
 *
 * The first occurrence keeps its bare slug. Each subsequent colliding swatch is
 * disambiguated by an OKLCH-derived qualifier describing how IT differs from the
 * swatch that owns the base name — e.g. `maroon` + `dark-maroon` instead of
 * `maroon` + `maroon-2`, which is far more meaningful in an exported token file.
 * This needs each group's `source` OKLCH; when it's missing (single-color paths
 * never hit this) or the two swatches are perceptually identical, we fall back to
 * the old numeric suffix. If a derived qualifier itself collides (e.g. two even
 * darker maroons), it too gets a numeric suffix (`dark-maroon-2`), so output is
 * always unique and deterministic. Returned names are already sanitized, and
 * `sanitizeName` is idempotent, so re-sanitizing in a serializer is a no-op.
 */
export function dedupeGroupNames(groups: ColorGroup[]): ColorGroup[] {
  const used = new Set<string>();
  // OKLCH source of the first group that claimed each base slug, so a later
  // collision can be described relative to it.
  const ownerSource = new Map<string, OKLCH | undefined>();

  return groups.map((g) => {
    const base = sanitizeName(g.name);
    if (!used.has(base)) {
      used.add(base);
      ownerSource.set(base, g.source);
      return { ...g, name: base };
    }

    // Collision: prefer an OKLCH-derived qualifier over a bare number.
    const owner = ownerSource.get(base);
    let candidate: string | null = null;
    if (g.source && owner) {
      const word = describeVariation(g.source, owner);
      if (word) candidate = `${word}-${base}`;
    }

    let slug: string;
    if (candidate && !used.has(candidate)) {
      slug = candidate;
    } else {
      const stem = candidate ?? base; // qualified-but-taken → suffix the qualifier
      let i = 2;
      while (used.has(`${stem}-${i}`)) i++;
      slug = `${stem}-${i}`;
    }
    used.add(slug);
    return { ...g, name: slug };
  });
}
