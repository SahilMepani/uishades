/**
 * Shared export-token normalization.
 *
 * tokens.ts is the single layer that turns either palette shape (Tailwind
 * 11-stop scale, OKLCH 11-step ramp - both keyed to the same 50…950 stops)
 * into a flat ColorToken[] the five serializers consume, plus the hex/oklch()
 * value renderer.
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
  dedupeGroupNames,
  semanticTokens,
  semanticVarName,
  type ColorGroup,
} from '../src/lib/exports/tokens';
import { STOPS } from '../src/lib/color/anchors';
import { contrastRatio } from '../src/lib/color/contrast';
import { toTailwindV4 } from '../src/lib/exports/tailwind-v4';
import { toTailwindV3 } from '../src/lib/exports/tailwind-v3';
import { toCssVars } from '../src/lib/exports/css-vars';
import { toW3CTokens } from '../src/lib/exports/w3c-tokens';
import { toFigmaVars } from '../src/lib/exports/figma-vars';
import { toStyleDictionary } from '../src/lib/exports/style-dictionary';

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
  it('keys tokens by the same 50…950 Tailwind stops, lightest first', () => {
    const tokens = rampToTokens(oklchRamp(hex));
    expect(tokens).toHaveLength(11);
    expect(tokens.map((t) => t.key)).toEqual(STOPS.map(String));
    // Lightest first: the '50' token's L should exceed the '950' token's L.
    expect(tokens[0].oklch.l).toBeGreaterThan(tokens[tokens.length - 1].oklch.l);
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
  it('returns an rgb() string derived from the hex in rgb mode', () => {
    const t = rampToTokens(oklchRamp(hex))[0];
    expect(tokenValue(t, 'rgb')).toMatch(/^rgb\(\d+ \d+ \d+\)$/);
  });
  it('returns an hsl() string derived from the hex in hsl mode', () => {
    const t = rampToTokens(oklchRamp(hex))[0];
    expect(tokenValue(t, 'hsl')).toMatch(/^hsl\([\d.]+ [\d.]+% [\d.]+%\)$/);
  });
});

describe('CSS-family serializers (group signature)', () => {
  const scaleTokens = scaleToTokens(buildScale(hex));
  const rampTokens = rampToTokens(oklchRamp(hex));
  const scaleGroup = [{ name: 'brand', tokens: scaleTokens }];
  const rampGroup = [{ name: 'brand', tokens: rampTokens }];

  it('tailwind-v4 emits --color-{slug}-{key} in hex mode', () => {
    const out = toTailwindV4(scaleGroup, 'hex');
    expect(out).toContain('@theme {');
    expect(out).toContain('--color-brand-500:');
    expect(out).toMatch(/--color-brand-500: #[0-9a-f]{6};/);
  });

  it('tailwind-v4 emits oklch() values in oklch mode', () => {
    const out = toTailwindV4(rampGroup, 'oklch');
    expect(out).toContain('--color-brand-50: oklch(');
    expect(out).toContain('--color-brand-950: oklch(');
  });

  it('css-vars emits --{slug}-{key} and follows the value mode', () => {
    expect(toCssVars(scaleGroup, 'hex')).toMatch(/--brand-500: #[0-9a-f]{6};/);
    expect(toCssVars(rampGroup, 'oklch')).toContain('--brand-50: oklch(');
  });

  it('tailwind-v3 ramp keys are valid quoted JS object keys', () => {
    const out = toTailwindV3(rampGroup, 'hex');
    expect(out).toContain("'50': '#");
    expect(out).toContain("'950': '#");
  });
});

describe('JSON serializers stay hex even in oklch mode', () => {
  const rampGroup = [{ name: 'brand', tokens: rampToTokens(oklchRamp(hex)) }];

  it('w3c-tokens emits hex $value despite oklch mode', () => {
    const out = toW3CTokens(rampGroup, 'oklch');
    const json = JSON.parse(out);
    expect(json.brand['50'].$value).toMatch(/^#[0-9a-f]{6}$/);
    expect(json.brand['50'].$type).toBe('color');
    expect(out).not.toContain('oklch(');
  });

  it('figma-vars emits hex values despite oklch mode', () => {
    const out = toFigmaVars(rampGroup, 'oklch');
    const json = JSON.parse(out);
    const v = json.collections[0].variables[0];
    expect(v.name).toBe('brand/50');
    expect(Object.values(v.valuesByMode)[0]).toMatch(/^#[0-9a-f]{6}$/);
    expect(out).not.toContain('oklch(');
  });

  it('style-dictionary emits hex value despite oklch mode', () => {
    const out = toStyleDictionary(rampGroup, 'oklch');
    const json = JSON.parse(out);
    expect(json.color.brand['50'].value).toMatch(/^#[0-9a-f]{6}$/);
    expect(out).not.toContain('oklch(');
  });
});

describe('multi-color palette export (the reported bug)', () => {
  // Two distinct palette colors, each its own group. Before the fix the export
  // only ever emitted the active color; now every group surfaces.
  const coral = scaleToTokens(buildScale(parseColor('#ff7f50')));
  const indigo = scaleToTokens(buildScale(parseColor('#4040ff')));
  const groups = [
    { name: 'coral', tokens: coral },
    { name: 'indigo', tokens: indigo },
  ];

  it('tailwind-v4 keeps every color in one @theme block', () => {
    const out = toTailwindV4(groups, 'hex');
    expect(out.match(/@theme \{/g)).toHaveLength(1); // one block, not two
    expect(out).toMatch(/--color-coral-500: #[0-9a-f]{6};/);
    expect(out).toMatch(/--color-indigo-500: #[0-9a-f]{6};/);
  });

  it('css-vars keeps every color in one :root block', () => {
    const out = toCssVars(groups, 'hex');
    expect(out.match(/:root \{/g)).toHaveLength(1);
    expect(out).toMatch(/--coral-500: #[0-9a-f]{6};/);
    expect(out).toMatch(/--indigo-500: #[0-9a-f]{6};/);
  });

  it('w3c-tokens nests every color under its own top-level key', () => {
    const json = JSON.parse(toW3CTokens(groups, 'hex'));
    expect(Object.keys(json)).toEqual(['coral', 'indigo']);
    expect(json.coral['500'].$value).toMatch(/^#[0-9a-f]{6}$/);
    expect(json.indigo['500'].$value).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('figma-vars groups every color into one "palette" collection', () => {
    const json = JSON.parse(toFigmaVars(groups, 'hex'));
    expect(json.collections).toHaveLength(1);
    expect(json.collections[0].name).toBe('palette');
    const names = json.collections[0].variables.map((v: { name: string }) => v.name);
    expect(names).toContain('coral/500');
    expect(names).toContain('indigo/500');
  });

  it('style-dictionary nests every color under the top-level color category', () => {
    const json = JSON.parse(toStyleDictionary(groups, 'hex'));
    expect(Object.keys(json)).toEqual(['color']);
    expect(Object.keys(json.color)).toEqual(['coral', 'indigo']);
    expect(json.color.coral['500'].value).toMatch(/^#[0-9a-f]{6}$/);
    expect(json.color.indigo['500'].value).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe('semanticTokens (tier-2 default variant set)', () => {
  const tokens = scaleToTokens(buildScale(hex));
  const group = (over: Partial<ColorGroup> = {}): ColorGroup => ({
    name: 'brand',
    semantic: 'Primary',
    anchorKey: '500',
    tokens,
    ...over,
  });

  it('returns [] when the group has no semantic label (tier-1 only)', () => {
    expect(semanticTokens(group({ semantic: undefined }))).toEqual([]);
  });

  it('maps base/hover/active off the anchor and surface/muted/border/emphasis to fixed stops', () => {
    const out = semanticTokens(group({ anchorKey: '500' }));
    const byVariant = Object.fromEntries(out.map((s) => [s.variant, s.ref]));
    expect(byVariant['']).toEqual({ stop: '500' }); // base = anchor
    expect(byVariant.hover).toEqual({ stop: '600' }); // +1 darker
    expect(byVariant.active).toEqual({ stop: '700' }); // +2 darker
    expect(byVariant.surface).toEqual({ stop: '50' });
    expect(byVariant.muted).toEqual({ stop: '100' });
    expect(byVariant.border).toEqual({ stop: '200' });
    expect(byVariant.emphasis).toEqual({ stop: '800' });
  });

  it('tracks a non-500 anchor for the interaction states', () => {
    const out = semanticTokens(group({ anchorKey: '300' }));
    const byVariant = Object.fromEntries(out.map((s) => [s.variant, s.ref]));
    expect(byVariant['']).toEqual({ stop: '300' });
    expect(byVariant.hover).toEqual({ stop: '400' });
    expect(byVariant.active).toEqual({ stop: '500' });
  });

  it('clamps hover/active at the darkest stop for a near-black anchor', () => {
    const out = semanticTokens(group({ anchorKey: '900' }));
    const byVariant = Object.fromEntries(out.map((s) => [s.variant, s.ref]));
    expect(byVariant['']).toEqual({ stop: '900' });
    expect(byVariant.hover).toEqual({ stop: '950' });
    expect(byVariant.active).toEqual({ stop: '950' }); // clamped, not out of range
  });

  it('appends an on-color literal hex that is the WCAG-higher-contrast of white vs the 950 shade', () => {
    const out = semanticTokens(group({ anchorKey: '500' }));
    const on = out.find((s) => s.variant === 'on');
    expect(on).toBeDefined();
    if (!on || !('hex' in on.ref)) throw new Error('on-color should be a literal hex');
    const base = tokens.find((t) => t.key === '500')!.hex;
    const darkest = tokens[tokens.length - 1].hex;
    const expected =
      contrastRatio('#ffffff', base) >= contrastRatio(darkest, base) ? '#ffffff' : darkest;
    expect(on.ref.hex).toBe(expected);
  });
});

describe('semanticVarName', () => {
  it('names the base bare, suffixes variants, and prefixes the foreground', () => {
    expect(semanticVarName('primary', '')).toBe('primary');
    expect(semanticVarName('primary', 'hover')).toBe('primary-hover');
    expect(semanticVarName('primary', 'on')).toBe('on-primary');
  });
});

describe('two-tier CSS serializers (semantic label present)', () => {
  const tokens = scaleToTokens(buildScale(parseColor('#f4a460'))); // sandy brown
  const groups: ColorGroup[] = [
    { name: 'sandy-brown', semantic: 'Primary', anchorKey: '500', tokens },
  ];

  it('tailwind-v4 emits primitives then a semantic var() alias tier', () => {
    const out = toTailwindV4(groups, 'hex');
    expect(out).toContain('/* primitives */');
    expect(out).toContain('/* semantic */');
    expect(out).toMatch(/--color-sandy-brown-500: #[0-9a-f]{6};/);
    expect(out).toContain('--color-primary: var(--color-sandy-brown-500);');
    expect(out).toContain('--color-primary-hover: var(--color-sandy-brown-600);');
    expect(out).toContain('--color-primary-surface: var(--color-sandy-brown-50);');
    expect(out).toMatch(/--color-on-primary: #[0-9a-f]{6};/); // literal, not a var()
  });

  it('css-vars emits the semantic tier without the color- prefix', () => {
    const out = toCssVars(groups, 'hex');
    expect(out).toContain('--primary: var(--sandy-brown-500);');
    expect(out).toContain('--primary-border: var(--sandy-brown-200);');
    expect(out).toMatch(/--on-primary: #[0-9a-f]{6};/);
  });

  it('tailwind-v3 nests the semantic tier as a resolved-hex role group', () => {
    const out = toTailwindV3(groups, 'hex');
    expect(out).toContain('semantic (tier 2)');
    const cfg = evalConfig(out);
    const colors = cfg.theme.extend.colors;
    expect(colors['sandy-brown']['500']).toMatch(/^#[0-9a-f]{6}$/);
    // The semantic base is a snapshot of the primitive anchor's hex.
    expect(colors.primary.DEFAULT).toBe(colors['sandy-brown']['500']);
    expect(colors.primary.hover).toBe(colors['sandy-brown']['600']);
    expect(colors.primary.on).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('JSON serializers ignore the semantic label (tier-1 only)', () => {
    expect(Object.keys(JSON.parse(toW3CTokens(groups, 'hex')))).toEqual(['sandy-brown']);
    expect(Object.keys(JSON.parse(toStyleDictionary(groups, 'hex')).color)).toEqual([
      'sandy-brown',
    ]);
  });

  it('omits the semantic tier (byte-identical legacy output) when no group has a label', () => {
    const bare: ColorGroup[] = [{ name: 'sandy-brown', tokens }];
    const out = toTailwindV4(bare, 'hex');
    expect(out).not.toContain('/* semantic */');
    expect(out).not.toContain('/* primitives */');
    expect(out).toBe(`@theme {\n${tokens.map((t) => `  --color-sandy-brown-${t.key}: ${t.hex};`).join('\n')}\n}\n`);
  });
});

/** Execute a `module.exports = …` snippet and return the exported value. */
function evalConfig(src: string): any {
  const mod = { exports: {} as any };
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  new Function('module', src)(mod);
  return mod.exports;
}

describe('dedupeGroupNames', () => {
  const tk = scaleToTokens(buildScale(hex));
  const oklch = (l: number, c: number, h: number) => ({ l, c, h });

  it('leaves already-unique slugs untouched (sanitized)', () => {
    const out = dedupeGroupNames([
      { name: 'Coral', tokens: tk },
      { name: 'Royal Blue', tokens: tk },
    ]);
    expect(out.map((g) => g.name)).toEqual(['coral', 'royal-blue']);
  });

  it('falls back to a numeric suffix when no source OKLCH is given', () => {
    const out = dedupeGroupNames([
      { name: 'indigo', tokens: tk },
      { name: 'indigo', tokens: tk },
      { name: 'indigo', tokens: tk },
    ]);
    expect(out.map((g) => g.name)).toEqual(['indigo', 'indigo-2', 'indigo-3']);
  });

  it('keeps W3C JSON keys distinct after a collision', () => {
    const deduped = dedupeGroupNames([
      { name: 'indigo', tokens: tk },
      { name: 'indigo', tokens: tk },
    ]);
    const json = JSON.parse(toW3CTokens(deduped, 'hex'));
    expect(Object.keys(json)).toEqual(['indigo', 'indigo-2']);
  });

  describe('OKLCH-derived qualifiers (the descriptive fix)', () => {
    it('appends -light/-dark when the collision differs in lightness', () => {
      const lighter = dedupeGroupNames([
        { name: 'maroon', tokens: tk, source: oklch(0.4, 0.1, 30) },
        { name: 'maroon', tokens: tk, source: oklch(0.62, 0.1, 30) },
      ]);
      expect(lighter.map((g) => g.name)).toEqual(['maroon', 'maroon-light']);

      const darker = dedupeGroupNames([
        { name: 'maroon', tokens: tk, source: oklch(0.5, 0.1, 30) },
        { name: 'maroon', tokens: tk, source: oklch(0.28, 0.1, 30) },
      ]);
      expect(darker.map((g) => g.name)).toEqual(['maroon', 'maroon-dark']);
    });

    it('appends -muted/-vivid when the collision differs in chroma', () => {
      const out = dedupeGroupNames([
        { name: 'teal', tokens: tk, source: oklch(0.5, 0.05, 195) },
        { name: 'teal', tokens: tk, source: oklch(0.5, 0.2, 195) }, // more chroma
        { name: 'teal', tokens: tk, source: oklch(0.5, 0.01, 195) }, // less chroma
      ]);
      expect(out.map((g) => g.name)).toEqual(['teal', 'teal-vivid', 'teal-muted']);
    });

    it('appends a hue word when the collision differs mainly in hue', () => {
      const out = dedupeGroupNames([
        { name: 'maroon', tokens: tk, source: oklch(0.5, 0.15, 30) }, // red
        { name: 'maroon', tokens: tk, source: oklch(0.5, 0.15, 70) }, // orange
      ]);
      expect(out.map((g) => g.name)).toEqual(['maroon', 'maroon-orange']);
    });

    it('numerically suffixes a qualifier that itself collides', () => {
      const out = dedupeGroupNames([
        { name: 'maroon', tokens: tk, source: oklch(0.5, 0.1, 30) },
        { name: 'maroon', tokens: tk, source: oklch(0.3, 0.1, 30) }, // dark
        { name: 'maroon', tokens: tk, source: oklch(0.22, 0.1, 30) }, // also dark
      ]);
      expect(out.map((g) => g.name)).toEqual(['maroon', 'maroon-dark', 'maroon-dark-2']);
    });

    it('falls back to a numeric suffix for perceptually identical swatches', () => {
      const out = dedupeGroupNames([
        { name: 'maroon', tokens: tk, source: oklch(0.4, 0.1, 30) },
        { name: 'maroon', tokens: tk, source: oklch(0.4, 0.1, 30) },
      ]);
      expect(out.map((g) => g.name)).toEqual(['maroon', 'maroon-2']);
    });

    it('keeps qualified W3C JSON keys distinct', () => {
      const deduped = dedupeGroupNames([
        { name: 'maroon', tokens: tk, source: oklch(0.5, 0.1, 30) },
        { name: 'maroon', tokens: tk, source: oklch(0.3, 0.1, 30) },
      ]);
      const json = JSON.parse(toW3CTokens(deduped, 'hex'));
      expect(Object.keys(json)).toEqual(['maroon', 'maroon-dark']);
    });
  });
});
