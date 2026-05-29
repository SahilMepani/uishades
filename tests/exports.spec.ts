/**
 * Export serializer output validity.
 *
 * Regression for the Tailwind v3 export emitting an unquoted hyphenated object
 * key (`burnt-orange: {`), which is a SyntaxError when the pasted config is
 * require()'d. The brand slug comes from sanitizeName, which keeps hyphens, and
 * 66 of 209 named-color slugs are hyphenated — so this broke the export for ~a
 * third of named colors. The fix quotes the key; this test parses the output as
 * real JavaScript rather than just string-matching.
 */
import { describe, it, expect } from 'vitest';
import { buildScale } from '../src/lib/color/scale';
import { parseColor } from '../src/lib/color/parse';
import { toTailwindV3 } from '../src/lib/exports/tailwind-v3';

const scale = buildScale(parseColor('#ff7f50'));

/** Execute a `module.exports = …` snippet and return the exported value. */
function evalConfig(src: string): any {
  const mod = { exports: {} as any };
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  new Function('module', src)(mod);
  return mod.exports;
}

describe('toTailwindV3', () => {
  it('quotes a hyphenated brand key and parses as valid JavaScript', () => {
    const out = toTailwindV3(scale, 'Burnt Orange'); // -> slug "burnt-orange"
    expect(out).toContain("'burnt-orange': {");
    expect(() => evalConfig(out)).not.toThrow();
    const cfg = evalConfig(out);
    expect(cfg.theme.extend.colors['burnt-orange']).toBeDefined();
    expect(Object.keys(cfg.theme.extend.colors['burnt-orange'])).toContain('500');
  });

  it('still parses for a single-word brand', () => {
    const cfg = evalConfig(toTailwindV3(scale, 'coral'));
    expect(cfg.theme.extend.colors.coral['950']).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('falls back to a parseable default key for an empty/symbol-only name', () => {
    // sanitizeName returns "brand" when nothing survives sanitization.
    const cfg = evalConfig(toTailwindV3(scale, '!!!'));
    expect(cfg.theme.extend.colors.brand).toBeDefined();
  });
});
