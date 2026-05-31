import { describe, expect, it } from 'vitest';
import { suggestPaletteName } from '../src/lib/color/palette-name';

describe('suggestPaletteName', () => {
  it('returns "" for an empty palette so the caller can substitute its own fallback', () => {
    expect(suggestPaletteName([])).toBe('');
  });

  it('names a single vivid red after the warm Sunset theme', () => {
    expect(suggestPaletteName(['#ff0000'])).toBe('Vibrant Sunset');
  });

  it('names a vivid blue after the Ocean theme', () => {
    expect(suggestPaletteName(['#0000ff'])).toBe('Vibrant Ocean');
  });

  it('uses the "Deep" tone for a dark navy', () => {
    expect(suggestPaletteName(['#1e3a8a'])).toBe('Deep Ocean');
  });

  it('names greens after the Forest theme', () => {
    expect(suggestPaletteName(['#10b981', '#00aa00'])).toBe('Vibrant Forest');
  });

  it('names teal/cyan after the Lagoon theme', () => {
    expect(suggestPaletteName(['#2dd4bf', '#0ea5e9'])).toBe('Vibrant Lagoon');
  });

  it('names a pink + deep red-pink palette after the Blossom theme', () => {
    // The colors from the user's screenshot.
    expect(suggestPaletteName(['#e91e63', '#632638'])).toBe('Vibrant Blossom');
  });

  it('labels a low-chroma light palette as Light Neutrals', () => {
    expect(suggestPaletteName(['#dddddd', '#cccccc'])).toBe('Light Neutrals');
  });

  it('labels a mid-lightness gray as Soft Neutrals', () => {
    expect(suggestPaletteName(['#888888'])).toBe('Soft Neutrals');
  });

  it('labels dark grays as Dark Neutrals', () => {
    expect(suggestPaletteName(['#333333', '#444444'])).toBe('Dark Neutrals');
  });

  it('falls back to the evocative Spectrum theme when colors span the wheel', () => {
    expect(suggestPaletteName(['#ff0000', '#00cc00', '#0000ff'])).toBe('Vibrant Spectrum');
  });

  it('is deterministic regardless of color order', () => {
    const a = suggestPaletteName(['#10b981', '#00aa00']);
    const b = suggestPaletteName(['#00aa00', '#10b981']);
    expect(a).toBe(b);
  });
});
