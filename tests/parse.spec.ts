import { describe, it, expect } from 'vitest';
import { parseColor, ParseError, toOklch, oklchToHex } from '../src/lib/color/parse';

describe('parseColor', () => {
  it('parses canonical lowercase hex', () => {
    expect(parseColor('#4040ff')).toBe('#4040ff');
  });

  it('parses bare hex without hash', () => {
    expect(parseColor('4040ff')).toBe('#4040ff');
  });

  it('parses 3-char shorthand hex (lowercase)', () => {
    expect(parseColor('#44f')).toBe('#4444ff');
  });

  it('parses bare 3-char shorthand hex (uppercase)', () => {
    expect(parseColor('44F')).toBe('#4444ff');
  });

  it('parses uppercase 6-char hex', () => {
    expect(parseColor('#4040FF')).toBe('#4040ff');
  });

  it('parses legacy rgb() with commas', () => {
    expect(parseColor('rgb(64, 64, 255)')).toBe('#4040ff');
  });

  it('parses modern rgb() with spaces', () => {
    expect(parseColor('rgb(64 64 255)')).toBe('#4040ff');
  });

  it('parses hsl() with commas', () => {
    // hsl(240, 100%, 63%) ~~ #4242ff ish (rgb of that hsl is roughly 66,66,255)
    const hex = parseColor('hsl(240, 100%, 63%)');
    expect(hex).toMatch(/^#[0-9a-f]{6}$/);
    expect(hex.startsWith('#4')).toBe(true);
  });

  it('parses oklch()', () => {
    const hex = parseColor('oklch(0.5 0.27 264)');
    expect(hex).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('parses CSS named color', () => {
    expect(parseColor('coral')).toBe('#ff7f50');
  });

  it('parses CSS named color case-insensitively', () => {
    expect(parseColor('DODGERBLUE')).toBe('#1e90ff');
  });

  it('trims whitespace from input', () => {
    expect(parseColor('  #4040ff  ')).toBe('#4040ff');
  });

  it('throws ParseError on garbage', () => {
    expect(() => parseColor('not a color')).toThrow(ParseError);
  });

  it('throws ParseError on empty string', () => {
    expect(() => parseColor('')).toThrow(ParseError);
  });

  it('throws ParseError on invalid hex characters', () => {
    expect(() => parseColor('#zzz')).toThrow(ParseError);
  });

  it('throws ParseError on null-ish input', () => {
    // @ts-expect-error intentionally exercising the runtime guard
    expect(() => parseColor(undefined)).toThrow(ParseError);
  });
});

describe('toOklch', () => {
  it('returns NaN hue for achromatic gray', () => {
    const oklch = toOklch('#777777');
    expect(oklch.c).toBeLessThan(0.01);
    expect(Number.isNaN(oklch.h)).toBe(true);
  });

  it('returns a finite hue for chromatic colors', () => {
    const oklch = toOklch('#4040ff');
    expect(Number.isFinite(oklch.h)).toBe(true);
  });

  it('round-trips approximately via oklchToHex', () => {
    const original = '#3b82f6';
    const oklch = toOklch(original);
    const back = oklchToHex(oklch);
    // Allow a single-bit channel rounding difference at most.
    expect(back).toMatch(/^#[0-9a-f]{6}$/);
    expect(back).toBe('#3b82f6');
  });
});
