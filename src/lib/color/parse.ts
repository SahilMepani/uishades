/**
 * Smart color parser + OKLCH helpers.
 *
 * Wraps culori's `parse` / `formatHex` / `converter` so the rest of the
 * codebase deals only in our canonical `Hex` form (lowercase `#rrggbb`)
 * and our `OKLCH` shape (with `h: NaN` for achromatic colors).
 */

import { parse, formatHex, converter, toGamut } from 'culori';
import type { Hex, OKLCH } from './types';

const oklchConv = converter('oklch');
const oklchToGamut = toGamut('rgb', 'oklch');

export class ParseError extends Error {
  constructor(public readonly input: string) {
    super(`Unrecognized color input: ${JSON.stringify(input)}`);
    this.name = 'ParseError';
  }
}

/**
 * Parse any CSS-recognized color form into canonical lowercase `#rrggbb`.
 *
 * Accepts: hex (`#rrggbb`, `#rgb`, bare `rrggbb`, bare `rgb` — culori treats
 * a bare hex string the same as one with a `#`), `rgb()`, `hsl()`,
 * `oklch()`, `oklab()`, `lab()`, `lch()`, `color(...)`, CSS named colors.
 *
 * Throws `ParseError` on garbage input or empty strings.
 */
export function parseColor(input: string): Hex {
  if (typeof input !== 'string' || input.trim() === '') {
    throw new ParseError(input);
  }
  const parsed = parse(input.trim());
  if (!parsed) {
    throw new ParseError(input);
  }
  // formatHex will produce lowercase `#rrggbb`; if a color is out of sRGB
  // gamut (e.g., a wide oklch), gamut-map first so the result is well-formed.
  const safe = oklchToGamut(parsed);
  const hex = formatHex(safe);
  if (!hex) {
    throw new ParseError(input);
  }
  return hex as Hex;
}

/**
 * Convert a canonical `Hex` to our `OKLCH` shape. Achromatic colors get
 * `h: NaN` (culori uses `undefined`; we normalize so the contract holds).
 */
export function toOklch(hex: Hex): OKLCH {
  const c = oklchConv(hex);
  if (!c) {
    throw new ParseError(hex);
  }
  return {
    l: c.l ?? 0,
    c: c.c ?? 0,
    h: typeof c.h === 'number' ? c.h : NaN,
  };
}

/**
 * Convert an OKLCH triple to canonical `Hex`, gamut-mapping to sRGB by
 * reducing chroma (culori's `toGamut('rgb', 'oklch')` -- the CSS Color 4
 * recommended algorithm). NaN hue is treated as 0 since culori ignores
 * hue for zero-chroma colors anyway.
 */
export function oklchToHex(oklch: OKLCH): Hex {
  const safe = oklchToGamut({
    mode: 'oklch',
    l: oklch.l,
    c: oklch.c,
    h: Number.isFinite(oklch.h) ? oklch.h : 0,
  });
  const hex = formatHex(safe);
  if (!hex) {
    throw new Error(`Could not format OKLCH ${JSON.stringify(oklch)} as hex`);
  }
  return hex as Hex;
}
