/**
 * Shared export-token normalization.
 *
 * tokens.ts is the single layer that turns either palette shape (Tailwind
 * 11-stop scale, OKLCH 20-step ramp) into a flat ColorToken[] the five
 * serializers consume, plus the hex/oklch() value renderer.
 */
import { describe, it, expect } from 'vitest';
import { parseColor } from '../src/lib/color/parse';
import { buildScale } from '../src/lib/color/scale';
import { oklchRamp } from '../src/lib/color/ramp';
import {
  sanitizeName,
  scaleToTokens,
  rampToTokens,
  tokenValue,
} from '../src/lib/exports/tokens';
import { toTailwindV4 } from '../src/lib/exports/tailwind-v4';
import { toTailwindV3 } from '../src/lib/exports/tailwind-v3';
import { toCssVars } from '../src/lib/exports/css-vars';
import { toTailwindV4 } from '../src/lib/exports/tailwind-v4';
import { toTailwindV3 } from '../src/lib/exports/tailwind-v3';
import { toCssVars } from '../src/lib/exports/css-vars';

const hex = parseColor('#4040ff');

describe('sanitizeName', () => {
  it('lowercases, hyphenates, and trims to a slug', () => {
    expect(sanitizeName('Burnt Orange')).toBe('burnt-orange');
  });
  it('falls back to "brand" when nothing survives', () => {
    expect(sanitizeName('!!!')).toBe('brand');
    expect(sanitizeName('')).toBe('brand');
  });
});

describe('scaleToTokens', () => {
  it('keys tokens by Tailwind stop number', () => {
    const tokens = scaleToTokens(buildScale(hex));
    expect(tokens).toHaveLength(11);
    expect(tokens[0].key).toBe('50');
    expect(tokens[tokens.length - 1].key).toBe('950');
    expect(tokens[0].hex).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe('rampToTokens', () => {
  it('keys tokens by 1-based step index, lightest first', () => {
    const tokens = rampToTokens(oklchRamp(hex));
    expect(tokens).toHaveLength(20);
    expect(tokens.map((t) => t.key)).toEqual(
      Array.from({ length: 20 }, (_, i) => String(i + 1)),
    );
    // Lightest first: token 1's L should exceed token 20's L.
    expect(tokens[0].oklch.l).toBeGreaterThan(tokens[19].oklch.l);
  });
});

describe('tokenValue', () => {
  it('returns the hex verbatim in hex mode', () => {
    const t = rampToTokens(oklchRamp(hex))[0];
    expect(tokenValue(t, 'hex')).toBe(t.hex);
  });
  it('returns an oklch() string derived from the hex in oklch mode', () => {
    const t = rampToTokens(oklchRamp(hex))[0];
    const v = tokenValue(t, 'oklch');
    expect(v).toMatch(/^oklch\([\d.]+ [\d.]+ [\d.]+\)$/);
  });
});
