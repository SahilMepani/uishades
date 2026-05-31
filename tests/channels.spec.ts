import { describe, it, expect } from 'vitest';
import {
  CHANNEL_DEFS,
  isChannelFormat,
  decompose,
  recompose,
  channelGradient,
  type ChannelFormat,
} from '../src/lib/color/channels';
import type { Hex } from '../src/lib/color/types';

describe('isChannelFormat', () => {
  it('accepts rgb/hsl/oklch and rejects hex', () => {
    expect(isChannelFormat('rgb')).toBe(true);
    expect(isChannelFormat('hsl')).toBe(true);
    expect(isChannelFormat('oklch')).toBe(true);
    expect(isChannelFormat('hex')).toBe(false);
    expect(isChannelFormat('nonsense')).toBe(false);
  });
});

describe('decompose', () => {
  it('splits RGB into 0-255 integers', () => {
    expect(decompose('#4040ff' as Hex, 'rgb')).toEqual([64, 64, 255]);
    expect(decompose('#000000' as Hex, 'rgb')).toEqual([0, 0, 0]);
    expect(decompose('#ffffff' as Hex, 'rgb')).toEqual([255, 255, 255]);
  });

  it('reports achromatic hue as 0 for HSL', () => {
    const [h, s] = decompose('#808080' as Hex, 'hsl');
    expect(h).toBe(0);
    expect(s).toBeCloseTo(0, 5);
  });

  it('reports achromatic hue as 0 for OKLCH', () => {
    const [, c, h] = decompose('#808080' as Hex, 'oklch');
    expect(c).toBeCloseTo(0, 5);
    expect(h).toBe(0);
  });

  it('returns values inside each channel range', () => {
    (['rgb', 'hsl', 'oklch'] as ChannelFormat[]).forEach((fmt) => {
      const vals = decompose('#3ab07c' as Hex, fmt);
      CHANNEL_DEFS[fmt].forEach((def, i) => {
        expect(vals[i]).toBeGreaterThanOrEqual(def.min);
        expect(vals[i]).toBeLessThanOrEqual(def.max);
      });
    });
  });
});

describe('decompose / recompose round-trip', () => {
  const samples: Hex[] = ['#4040ff', '#ff0000', '#3ab07c', '#eec8da', '#123456'] as Hex[];

  it('round-trips RGB exactly', () => {
    samples.forEach((hex) => {
      expect(recompose(decompose(hex, 'rgb'), 'rgb')).toBe(hex);
    });
  });

  it('round-trips HSL within rounding tolerance', () => {
    samples.forEach((hex) => {
      // sRGB->HSL->sRGB is exact for in-gamut colors; allow ±1 per channel.
      const back = recompose(decompose(hex, 'hsl'), 'hsl');
      expect(back).toBe(hex);
    });
  });

  it('round-trips OKLCH within a tight tolerance', () => {
    samples.forEach((hex) => {
      const back = recompose(decompose(hex, 'oklch'), 'oklch');
      // OKLCH passes through float chroma; allow a 1-step deviation per channel.
      const a = decompose(hex, 'rgb');
      const b = decompose(back, 'rgb');
      a.forEach((v, i) => expect(Math.abs(v - b[i])).toBeLessThanOrEqual(1));
    });
  });
});

describe('recompose gamut mapping', () => {
  it('maps an out-of-gamut OKLCH tuple to a valid hex', () => {
    // High chroma at mid lightness is well outside sRGB.
    const hex = recompose([0.7, 0.4, 30], 'oklch');
    expect(hex).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe('channelGradient', () => {
  it('returns a linear-gradient with valid hex stops', () => {
    const vals = decompose('#4040ff' as Hex, 'rgb');
    const g = channelGradient(vals, 'rgb', 0);
    expect(g.startsWith('linear-gradient(to right, ')).toBe(true);
    const stops = g.match(/#[0-9a-f]{6}/g) ?? [];
    expect(stops.length).toBe(11); // 10 steps -> 11 stops
  });

  it('uses more stops for hue channels', () => {
    const vals = decompose('#4040ff' as Hex, 'hsl');
    const hueGrad = channelGradient(vals, 'hsl', 0); // H is hue
    const satGrad = channelGradient(vals, 'hsl', 1); // S is not
    const hueStops = (hueGrad.match(/#[0-9a-f]{6}/g) ?? []).length;
    const satStops = (satGrad.match(/#[0-9a-f]{6}/g) ?? []).length;
    expect(hueStops).toBe(25); // 24 steps -> 25 stops
    expect(satStops).toBe(11);
    expect(hueStops).toBeGreaterThan(satStops);
  });

  it('endpoint stops reflect the channel min and max', () => {
    const vals = decompose('#4040ff' as Hex, 'rgb');
    const g = channelGradient(vals, 'rgb', 0); // sweep R, hold G=64 B=255
    const stops = g.match(/#[0-9a-f]{6}/g) ?? [];
    expect(stops[0]).toBe(recompose([0, vals[1], vals[2]], 'rgb'));
    expect(stops[stops.length - 1]).toBe(recompose([255, vals[1], vals[2]], 'rgb'));
  });
});
