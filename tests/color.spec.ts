import { describe, it, expect } from 'vitest';
import { classicRamp } from '../src/lib/color/classic';
import { oklchRamp } from '../src/lib/color/ramp';
import { buildScale } from '../src/lib/color/scale';
import { contrastRatio, wcagLevel } from '../src/lib/color/contrast';
import { ANCHORS, STOPS } from '../src/lib/color/anchors';
import { formatForCopy } from '../src/lib/color/format';

function hexesOf(ramp: { shades: { hex: string }[] }): string[] {
  return ramp.shades.map(s => s.hex);
}

describe('classicRamp — reference parity', () => {
  it('matches the 0to255 reference exactly for #4040ff', () => {
    const ref = [
      '#ffffff', '#fbfbff', '#eaeaff', '#d9d9ff', '#c8c8ff', '#b7b7ff',
      '#a6a6ff', '#9595ff', '#8484ff', '#7373ff', '#6262ff', '#5151ff',
      '#4040ff', '#2f2fff', '#1e1eff', '#0d0dff', '#0000fb', '#0000ea',
      '#0000d9', '#0000c8', '#0000b7', '#0000a6', '#000095', '#000084',
      '#000073', '#000062', '#000051', '#000040', '#00002f', '#00001e',
      '#00000d', '#000000',
    ];
    const ramp = classicRamp('#4040ff');
    expect(hexesOf(ramp)).toEqual(ref);
    expect(ramp.mode).toBe('classic');
    expect(ramp.shades[ramp.inputIndex].hex).toBe('#4040ff');
    expect(ramp.shades[ramp.inputIndex].isInput).toBe(true);
  });

  it('always starts with #ffffff and ends with #000000 for non-endpoint inputs', () => {
    for (const input of ['#4040ff', '#ff0000', '#00ff00', '#0000ff', '#808080', '#ff7f50', '#aabbcc']) {
      const ramp = classicRamp(input);
      expect(ramp.shades[0].hex).toBe('#ffffff');
      expect(ramp.shades[ramp.shades.length - 1].hex).toBe('#000000');
    }
  });

  it('preserves the input hex verbatim at inputIndex', () => {
    for (const input of ['#4040ff', '#ff0000', '#aabbcc', '#ff7f50']) {
      const ramp = classicRamp(input);
      expect(ramp.shades[ramp.inputIndex].hex).toBe(input);
    }
  });

  it('snapshot — additional inputs', () => {
    const inputs = ['#ff0000', '#00ff00', '#0000ff', '#808080', '#ff7f50', '#000000', '#ffffff', '#aabbcc', '#abcdef'];
    const snapshot: Record<string, string[]> = {};
    for (const i of inputs) snapshot[i] = hexesOf(classicRamp(i));
    expect(snapshot).toMatchSnapshot();
  });

  it('handles pure white input — single white entry then gray ramp to black', () => {
    const ramp = classicRamp('#ffffff');
    expect(ramp.shades[0].hex).toBe('#ffffff');
    expect(ramp.shades[ramp.shades.length - 1].hex).toBe('#000000');
    // input is the white at index 0 (dedup means input isn't duplicated)
    expect(ramp.inputIndex).toBe(0);
    expect(ramp.shades[0].isInput).toBe(true);
  });

  it('handles pure black input — gray ramp from white to single black entry', () => {
    const ramp = classicRamp('#000000');
    expect(ramp.shades[0].hex).toBe('#ffffff');
    expect(ramp.shades[ramp.shades.length - 1].hex).toBe('#000000');
    expect(ramp.inputIndex).toBe(ramp.shades.length - 1);
    expect(ramp.shades[ramp.inputIndex].isInput).toBe(true);
  });
});

describe('oklchRamp', () => {
  it('produces exactly 22 shades with #ffffff and #000000 endpoints', () => {
    const ramp = oklchRamp('#4040ff');
    expect(ramp.shades).toHaveLength(22);
    expect(ramp.shades[0].hex).toBe('#ffffff');
    expect(ramp.shades[21].hex).toBe('#000000');
    expect(ramp.mode).toBe('oklch');
  });

  it('has monotonically decreasing OKLCH L across all shades', () => {
    const ramp = oklchRamp('#4040ff');
    for (let i = 1; i < ramp.shades.length; i++) {
      const prev = ramp.shades[i - 1].oklch.l;
      const cur = ramp.shades[i].oklch.l;
      expect(cur).toBeLessThanOrEqual(prev);
    }
  });

  it('preserves input hex verbatim at inputIndex', () => {
    const ramp = oklchRamp('#4040ff');
    expect(ramp.shades[ramp.inputIndex].hex).toBe('#4040ff');
    expect(ramp.shades[ramp.inputIndex].isInput).toBe(true);
    // inputIndex must be an interior (not an endpoint) index.
    expect(ramp.inputIndex).toBeGreaterThanOrEqual(1);
    expect(ramp.inputIndex).toBeLessThanOrEqual(20);
  });

  it('handles achromatic input (#777) without crashing', () => {
    const ramp = oklchRamp('#777777');
    expect(ramp.shades).toHaveLength(22);
    expect(ramp.shades[0].hex).toBe('#ffffff');
    expect(ramp.shades[21].hex).toBe('#000000');
  });
});

describe('buildScale — Tailwind 11-stop', () => {
  it('produces 11 shades in the canonical stop order', () => {
    const scale = buildScale('#3b82f6');
    expect(scale.shades).toHaveLength(11);
    expect(scale.shades.map(s => s.stop)).toEqual([...STOPS]);
  });

  it('snaps #3b82f6 (Tailwind blue-500) to stop 500', () => {
    const scale = buildScale('#3b82f6');
    expect(scale.anchorStop).toBe(500);
    const anchor = scale.shades.find(s => s.stop === 500)!;
    expect(anchor.hex).toBe('#3b82f6');
    expect(anchor.isInput).toBe(true);
  });

  it('snaps a pastel like #fde68a (amber-200) to stop 200, not 500', () => {
    const scale = buildScale('#fde68a');
    expect(scale.anchorStop).toBe(200);
    const anchor = scale.shades.find(s => s.stop === 200)!;
    expect(anchor.hex).toBe('#fde68a');
    expect(anchor.isInput).toBe(true);
  });

  it('each stop matches its anchor L within ±0.02 and hue within ±2°', () => {
    const scale = buildScale('#3b82f6');
    const inputHue = scale.shades.find(s => s.isInput)!.oklch.h;
    for (const shade of scale.shades) {
      const anchor = ANCHORS[shade.stop as keyof typeof ANCHORS];
      expect(Math.abs(shade.oklch.l - anchor.l)).toBeLessThanOrEqual(0.02);
      // Skip hue check when chroma is too low to have a meaningful hue.
      if (shade.oklch.c > 0.01 && Number.isFinite(shade.oklch.h)) {
        // Compute shortest angular distance
        let d = Math.abs(shade.oklch.h - inputHue);
        if (d > 180) d = 360 - d;
        expect(d).toBeLessThanOrEqual(2);
      }
    }
  });
});

describe('contrast', () => {
  it('#000 vs #fff = 21', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
  });

  it('#777 vs #fff ≈ 4.48', () => {
    expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.48, 1);
  });

  it('identical colors have ratio 1', () => {
    expect(contrastRatio('#4040ff', '#4040ff')).toBeCloseTo(1, 5);
  });

  it('wcagLevel maps ratios to standard tiers (normal text)', () => {
    expect(wcagLevel(21)).toBe('AAA');
    expect(wcagLevel(7)).toBe('AAA');
    expect(wcagLevel(6)).toBe('AA');
    expect(wcagLevel(4.5)).toBe('AA');
    expect(wcagLevel(4)).toBe('AA-Lg');
    expect(wcagLevel(3)).toBe('AA-Lg');
    expect(wcagLevel(2)).toBe('fail');
  });

  it('wcagLevel respects large-text thresholds', () => {
    expect(wcagLevel(4.5, true)).toBe('AAA');
    expect(wcagLevel(3, true)).toBe('AA');
    expect(wcagLevel(2, true)).toBe('fail');
  });
});

describe('formatForCopy', () => {
  it('returns the canonical hex unchanged', () => {
    expect(formatForCopy('#4040ff', 'hex')).toBe('#4040ff');
  });

  it('formats as modern rgb()', () => {
    expect(formatForCopy('#4040ff', 'rgb')).toBe('rgb(64 64 255)');
  });

  it('formats as hsl()', () => {
    const out = formatForCopy('#4040ff', 'hsl');
    expect(out.startsWith('hsl(')).toBe(true);
    expect(out.endsWith(')')).toBe(true);
  });

  it('formats as oklch()', () => {
    const out = formatForCopy('#4040ff', 'oklch');
    expect(out.startsWith('oklch(')).toBe(true);
  });

  it('formats as CSS var() with name + stop', () => {
    expect(formatForCopy('#3b82f6', 'cssVar', { name: 'brand', stop: 500 })).toBe('var(--brand-500)');
  });

  it('formats as Tailwind utility class', () => {
    expect(formatForCopy('#3b82f6', 'tailwindClass', { name: 'brand', stop: 500 })).toBe('bg-brand-500');
  });
});

describe('formatForCopy — hsv and hwb', () => {
  it('emits hsv() for representative colors', () => {
    expect(formatForCopy('#4040ff', 'hsv')).toMatchInlineSnapshot(`"hsv(240 74.9% 100%)"`);
    expect(formatForCopy('#ffffff', 'hsv')).toMatchInlineSnapshot(`"hsv(0 0% 100%)"`);
    expect(formatForCopy('#808080', 'hsv')).toMatchInlineSnapshot(`"hsv(0 0% 50.2%)"`);
    expect(formatForCopy('#ff7f50', 'hsv')).toMatchInlineSnapshot(`"hsv(16.1 68.6% 100%)"`);
  });
  it('emits hwb() for representative colors', () => {
    expect(formatForCopy('#4040ff', 'hwb')).toMatchInlineSnapshot(`"hwb(240 25.1% 0%)"`);
    expect(formatForCopy('#ffffff', 'hwb')).toMatchInlineSnapshot(`"hwb(0 100% 0%)"`);
    expect(formatForCopy('#808080', 'hwb')).toMatchInlineSnapshot(`"hwb(0 50.2% 49.8%)"`);
    expect(formatForCopy('#ff7f50', 'hwb')).toMatchInlineSnapshot(`"hwb(16.1 31.4% 0%)"`);
  });
});
