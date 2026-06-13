/**
 * Shared color-math contract.
 *
 * Every downstream wave (color-math, data-sources, tool-ui, astro-routing)
 * codes against the types in this file. Do not redefine these elsewhere;
 * extend or augment via a single coordinating change instead.
 */

export type Hex = string; // canonical form: lowercase '#rrggbb' (no shorthand, always with hash)

export interface OKLCH {
  l: number; // 0..1
  c: number; // 0..~0.4 in sRGB gamut
  h: number; // 0..360 (degrees), NaN allowed for achromatic
}

export interface Shade {
  hex: Hex;
  oklch: OKLCH;
  stop?: number;     // present in Tailwind-scale shades: 50, 100, ..., 950
  isInput?: boolean; // true if this shade is the user's pinned input color
}

export type RampMode = 'oklch' | 'classic';

export interface ContinuousRamp {
  mode: RampMode;
  shades: Shade[];   // ordered lightest -> darkest, including endpoints (white/black)
  inputIndex: number; // index where user's input is pinned
}

export interface TailwindScale {
  shades: Shade[];   // exactly 11 entries: stops 50..950 in order
  anchorStop: number; // which stop the input was snapped to
}

export interface ColorPageData {
  input: Hex;
  ramp: ContinuousRamp;
  scale: TailwindScale;
  neighbors: { lighter: Hex[]; darker: Hex[] }; // 3 each, for SEO crawl graph
}

export type CopyFormat = 'hex' | 'rgb' | 'hsl' | 'oklch' | 'cssVar' | 'tailwindClass';

export type ExportFormat = 'tailwind-v4' | 'tailwind-v3' | 'css-vars' | 'w3c-tokens' | 'figma-vars' | 'style-dictionary';
