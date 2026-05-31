/**
 * Evocative palette-name suggestions for the "Save palette" flow.
 *
 * `suggestPaletteName` turns a set of colors into a short, human-friendly
 * `"{Tone} {Theme}"` label (e.g. `"Deep Ocean"`, `"Soft Blossom"`,
 * `"Light Neutrals"`) so the save dialog can pre-fill something better than
 * "Untitled palette". It is pure and deterministic so the React island can
 * call it on every tray change and so it is unit-testable.
 *
 * Theme comes from the chroma-weighted dominant OKLCH hue (gray swatches carry
 * ~0 weight so they don't skew it); tone comes from average lightness/chroma.
 * Achromatic palettes collapse to the "Neutrals" theme, and palettes whose
 * colors span most of the hue wheel collapse to "Spectrum".
 */
import { toOklch } from './parse';
import { ACHROMATIC_CHROMA } from './hue';
import type { Hex } from './types';

/**
 * Evocative theme noun per OKLCH hue band. Bands are expressed in OKLCH
 * degrees (not HSL) and cover the full wheel; `Blossom` straddles 0°/360°.
 * Bounds were tuned against measured OKLCH hues of representative colors
 * (e.g. pure red ≈ 29°, blue ≈ 264°, magenta ≈ 328°).
 */
const HUE_THEMES: ReadonlyArray<{ max: number; theme: string }> = [
  { max: 18, theme: 'Blossom' }, // 0–18: crimson/pink
  { max: 70, theme: 'Sunset' }, // reds + oranges
  { max: 110, theme: 'Citrus' }, // yellows
  { max: 175, theme: 'Forest' }, // greens
  { max: 215, theme: 'Lagoon' }, // teal/cyan
  { max: 280, theme: 'Ocean' }, // blues
  { max: 320, theme: 'Twilight' }, // purples/violets
  { max: 360, theme: 'Blossom' }, // 320–360: magenta/pink
];

/** Below this chroma-weighted resultant length the hues are too scattered for
 * a single theme to be honest, so we use the evocative catch-all "Spectrum".
 * Only applied with 3+ chromatic colors so a deliberate complementary pair
 * still gets its dominant-hue theme. */
const SPECTRUM_RESULTANT = 0.35;

function themeForHue(hueDeg: number): string {
  const h = ((hueDeg % 360) + 360) % 360;
  for (const band of HUE_THEMES) {
    if (h < band.max) return band.theme;
  }
  return 'Blossom'; // unreachable: last band's max is 360
}

/** Tone word for a chromatic palette, from average lightness then chroma. */
function chromaticTone(avgL: number, avgC: number): string {
  if (avgL >= 0.78) return 'Light';
  if (avgL <= 0.4) return 'Deep';
  if (avgC >= 0.13) return 'Vibrant';
  if (avgC <= 0.06) return 'Muted';
  return 'Soft';
}

/** Tone word for an achromatic ("Neutrals") palette, from average lightness. */
function neutralTone(avgL: number): string {
  if (avgL >= 0.78) return 'Light';
  if (avgL <= 0.4) return 'Dark';
  return 'Soft';
}

/**
 * Suggest a `"{Tone} {Theme}"` name for a palette. Returns `""` for an empty
 * input so the caller can substitute its own fallback string.
 */
export function suggestPaletteName(hexes: Hex[]): string {
  if (hexes.length === 0) return '';

  let sumL = 0;
  let sumC = 0;
  // Chroma-weighted hue resultant vector (circular mean + concentration).
  let vx = 0;
  let vy = 0;
  let chromaticWeight = 0;
  let chromaticCount = 0;

  for (const hex of hexes) {
    const { l, c, h } = toOklch(hex);
    sumL += l;
    sumC += c;
    if (c >= ACHROMATIC_CHROMA && Number.isFinite(h)) {
      chromaticCount += 1;
      chromaticWeight += c;
      const rad = (h * Math.PI) / 180;
      vx += Math.cos(rad) * c;
      vy += Math.sin(rad) * c;
    }
  }

  const avgL = sumL / hexes.length;
  const avgC = sumC / hexes.length;

  // Achromatic / near-gray palette → Neutrals.
  if (avgC < ACHROMATIC_CHROMA || chromaticWeight === 0) {
    return `${neutralTone(avgL)} Neutrals`;
  }

  const resultant = Math.hypot(vx, vy) / chromaticWeight;
  const tone = chromaticTone(avgL, avgC);

  if (chromaticCount >= 3 && resultant < SPECTRUM_RESULTANT) {
    return `${tone} Spectrum`;
  }

  const meanHue = ((Math.atan2(vy, vx) * 180) / Math.PI + 360) % 360;
  return `${tone} ${themeForHue(meanHue)}`;
}
