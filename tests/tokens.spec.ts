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
import { toW3CTokens } from '../src/lib/exports/w3c-tokens';
import { toFigmaVars } from '../src/lib/exports/figma-vars';

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

describe('CSS-family serializers (new tokens signature)', () => {
  const scaleTokens = scaleToTokens(buildScale(hex));
  const rampTokens = rampToTokens(oklchRamp(hex));

  it('tailwind-v4 emits --color-{slug}-{key} in hex mode', () => {
    const out = toTailwindV4(scaleTokens, 'brand', 'hex');
    expect(out).toContain('@theme {');
    expect(out).toContain('--color-brand-500:');
    expect(out).toMatch(/--color-brand-500: #[0-9a-f]{6};/);
  });

  it('tailwind-v4 emits oklch() values in oklch mode', () => {
    const out = toTailwindV4(rampTokens, 'brand', 'oklch');
    expect(out).toContain('--color-brand-1: oklch(');
    expect(out).toContain('--color-brand-20: oklch(');
  });

  it('css-vars emits --{slug}-{key} and follows the value mode', () => {
    expect(toCssVars(scaleTokens, 'brand', 'hex')).toMatch(/--brand-500: #[0-9a-f]{6};/);
    expect(toCssVars(rampTokens, 'brand', 'oklch')).toContain('--brand-1: oklch(');
  });

  it('tailwind-v3 ramp keys are valid quoted JS object keys', () => {
    const out = toTailwindV3(rampTokens, 'brand', 'hex');
    expect(out).toContain("'1': '#");
    expect(out).toContain("'20': '#");
  });
});

describe('JSON serializers stay hex even in oklch mode', () => {
  const rampTokens = rampToTokens(oklchRamp(hex));

  it('w3c-tokens emits hex $value despite oklch mode', () => {
    const out = toW3CTokens(rampTokens, 'brand', 'oklch');
    const json = JSON.parse(out);
    expect(json.brand['1'].$value).toMatch(/^#[0-9a-f]{6}$/);
    expect(json.brand['1'].$type).toBe('color');
    expect(out).not.toContain('oklch(');
  });

  it('figma-vars emits hex values despite oklch mode', () => {
    const out = toFigmaVars(rampTokens, 'brand', 'oklch');
    const json = JSON.parse(out);
    const v = json.collections[0].variables[0];
    expect(v.name).toBe('brand/1');
    expect(Object.values(v.valuesByMode)[0]).toMatch(/^#[0-9a-f]{6}$/);
    expect(out).not.toContain('oklch(');
  });
});
