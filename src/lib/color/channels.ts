/**
 * Per-channel decomposition for the color-picker sliders.
 *
 * Splits a canonical `Hex` into the individual channels of a value format
 * (RGB / HSL / OKLCH) so each can drive a slider, recomposes the channels back
 * to `Hex`, and paints each slider's track with the gradient produced by
 * sweeping that one channel while the others are held fixed.
 *
 * All recomposition routes through `parseColor`, so its sRGB gamut mapping is
 * reused and out-of-gamut OKLCH samples still yield a well-formed `#rrggbb`.
 */

import { converter } from 'culori';
import { parseColor } from './parse';
import type { Hex } from './types';

const rgbConv = converter('rgb');
const hslConv = converter('hsl');
const oklchConv = converter('oklch');

/** The value formats that expose per-channel sliders (HEX is excluded). */
export type ChannelFormat = 'rgb' | 'hsl' | 'oklch';

export interface ChannelDef {
  key: string; // 'r' | 'g' | 'b' | 'h' | 's' | 'l' | 'c'
  label: string; // short label shown beside the slider, e.g. 'R'
  /** Full accessible name, e.g. 'Red channel' / 'OKLCH lightness channel'. */
  ariaLabel: string;
  min: number;
  max: number;
  step: number;
  /** Hue channels sweep the spectrum and need many gradient stops. */
  hue?: boolean;
}

export const CHANNEL_DEFS: Record<ChannelFormat, ChannelDef[]> = {
  rgb: [
    { key: 'r', label: 'R', ariaLabel: 'Red channel', min: 0, max: 255, step: 1 },
    { key: 'g', label: 'G', ariaLabel: 'Green channel', min: 0, max: 255, step: 1 },
    { key: 'b', label: 'B', ariaLabel: 'Blue channel', min: 0, max: 255, step: 1 },
  ],
  hsl: [
    { key: 'h', label: 'H', ariaLabel: 'Hue channel', min: 0, max: 360, step: 1, hue: true },
    { key: 's', label: 'S', ariaLabel: 'Saturation channel', min: 0, max: 100, step: 1 },
    { key: 'l', label: 'L', ariaLabel: 'Lightness channel', min: 0, max: 100, step: 1 },
  ],
  oklch: [
    { key: 'l', label: 'L', ariaLabel: 'OKLCH lightness channel', min: 0, max: 1, step: 0.001 },
    { key: 'c', label: 'C', ariaLabel: 'OKLCH chroma channel', min: 0, max: 0.4, step: 0.001 },
    { key: 'h', label: 'H', ariaLabel: 'OKLCH hue channel', min: 0, max: 360, step: 1, hue: true },
  ],
};

/** Type guard: does this value format expose channel sliders? */
export function isChannelFormat(fmt: string): fmt is ChannelFormat {
  return fmt === 'rgb' || fmt === 'hsl' || fmt === 'oklch';
}

/**
 * Split `hex` into the channel values for `fmt`, in the order of
 * `CHANNEL_DEFS[fmt]`. RGB channels are 0–255 integers; HSL S/L are 0–100;
 * OKLCH keeps native units (L 0–1, C 0–0.4, H 0–360). Achromatic hue (culori
 * `NaN`/`undefined`) is reported as `0` so the slider has a concrete position.
 */
export function decompose(hex: Hex, fmt: ChannelFormat): number[] {
  if (fmt === 'rgb') {
    const c = rgbConv(hex) ?? { r: 0, g: 0, b: 0 };
    return [
      Math.round((c.r ?? 0) * 255),
      Math.round((c.g ?? 0) * 255),
      Math.round((c.b ?? 0) * 255),
    ];
  }
  if (fmt === 'hsl') {
    const c = hslConv(hex) ?? { h: 0, s: 0, l: 0 };
    return [
      Number.isFinite(c.h) ? (c.h as number) : 0,
      (c.s ?? 0) * 100,
      (c.l ?? 0) * 100,
    ];
  }
  const c = oklchConv(hex) ?? { l: 0, c: 0, h: 0 };
  return [
    c.l ?? 0,
    c.c ?? 0,
    Number.isFinite(c.h) ? (c.h as number) : 0,
  ];
}

/** Build the `fn(...)` CSS string for a channel tuple (no parsing). */
function toCss(values: number[], fmt: ChannelFormat): string {
  if (fmt === 'rgb') return `rgb(${values[0]} ${values[1]} ${values[2]})`;
  if (fmt === 'hsl') return `hsl(${values[0]} ${values[1]}% ${values[2]}%)`;
  return `oklch(${values[0]} ${values[1]} ${values[2]})`;
}

/**
 * Recompose a channel tuple back to canonical `Hex`, reusing `parseColor`'s
 * gamut mapping (so an out-of-gamut OKLCH tuple still returns a valid hex).
 */
export function recompose(values: number[], fmt: ChannelFormat): Hex {
  return parseColor(toCss(values, fmt));
}

/**
 * A `linear-gradient(to right, …)` for slider `index`: the track the user sees
 * when they sweep that one channel with the others held at their current
 * values. Built by sampling the channel from `min`→`max` and converting each
 * sample to hex via `recompose`, so the track is accurate and gamut-correct for
 * every format (rather than depending on the browser's gradient interpolation).
 */
export function channelGradient(values: number[], fmt: ChannelFormat, index: number): string {
  const def = CHANNEL_DEFS[fmt][index];
  const steps = def.hue ? 24 : 10;
  const stops: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const sample = values.slice();
    sample[index] = def.min + (def.max - def.min) * t;
    stops.push(recompose(sample, fmt));
  }
  return `linear-gradient(to right, ${stops.join(', ')})`;
}
