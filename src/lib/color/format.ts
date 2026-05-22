/**
 * Copy-format converters.
 *
 * Maps a canonical `Hex` into one of the user-selectable copy formats
 * (hex / rgb / hsl / oklch / CSS variable / Tailwind class). Numeric
 * rounding tuned to match what designers typically expect to see when
 * they paste from this tool into their codebase.
 */

import { converter, formatHex } from 'culori';
import type { CopyFormat, Hex } from './types';

const rgbConv = converter('rgb');
const hslConv = converter('hsl');
const oklchConv = converter('oklch');

function round(n: number, digits: number): number {
  const k = 10 ** digits;
  return Math.round(n * k) / k;
}

export function formatForCopy(
  hex: Hex,
  format: CopyFormat,
  opts: { name?: string; stop?: number } = {},
): string {
  switch (format) {
    case 'hex': {
      // Re-format through culori to defensively normalize unusual inputs.
      return formatHex(hex) ?? hex;
    }
    case 'rgb': {
      const c = rgbConv(hex);
      if (!c) return hex;
      const r = Math.round((c.r ?? 0) * 255);
      const g = Math.round((c.g ?? 0) * 255);
      const b = Math.round((c.b ?? 0) * 255);
      // Modern syntax (space-separated). Matches Tailwind v4 + CSS Color 4.
      return `rgb(${r} ${g} ${b})`;
    }
    case 'hsl': {
      const c = hslConv(hex);
      if (!c) return hex;
      const h = round(c.h ?? 0, 1);
      const s = round((c.s ?? 0) * 100, 1);
      const l = round((c.l ?? 0) * 100, 1);
      return `hsl(${h} ${s}% ${l}%)`;
    }
    case 'oklch': {
      const c = oklchConv(hex);
      if (!c) return hex;
      const l = round(c.l ?? 0, 4);
      const ch = round(c.c ?? 0, 4);
      const h = Number.isFinite(c.h) ? round(c.h ?? 0, 2) : 0;
      return `oklch(${l} ${ch} ${h})`;
    }
    case 'cssVar': {
      const name = (opts.name ?? 'color').trim();
      const stop = opts.stop;
      const suffix = stop !== undefined ? `-${stop}` : '';
      return `var(--${name}${suffix})`;
    }
    case 'tailwindClass': {
      // Default Tailwind utility is `bg-`; the user picks the prefix outside
      // this function if they need text- / border- / etc.
      const name = (opts.name ?? 'color').trim();
      const stop = opts.stop;
      const suffix = stop !== undefined ? `-${stop}` : '';
      return `bg-${name}${suffix}`;
    }
  }
}
