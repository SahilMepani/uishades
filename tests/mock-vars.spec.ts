import { describe, it, expect } from 'vitest';
import { computeMockVars, resolveRoles } from '../src/components/mocks/vars';
import { MOCK_TEMPLATES, getMockTemplate, HERO_MOCK } from '../src/components/mocks';
import { contrastRatio } from '../src/lib/color/contrast';
import type { Hex } from '../src/lib/color/types';

const WHITE = '#ffffff' as Hex;
const BLACK = '#0a0a0a' as Hex;

describe('resolveRoles — explicit roles', () => {
  it('honors explicit roles regardless of order', () => {
    const r = resolveRoles([
      { hex: '#112233', role: 'text' },
      { hex: '#ffeedd', role: 'bg' },
      { hex: '#cc3344', role: 'accent' },
      { hex: '#445566', role: 'surface' },
    ]);
    expect(r.bg).toBe('#ffeedd');
    expect(r.surface).toBe('#445566');
    expect(r.accent).toBe('#cc3344');
    expect(r.text).toBe('#112233');
    expect(r.extras).toEqual([]);
  });

  it('routes role="extra" and duplicate-role colors into extras', () => {
    const r = resolveRoles([
      { hex: '#000000', role: 'text' },
      { hex: '#111111', role: 'text' }, // duplicate role -> extra
      { hex: '#222222', role: 'extra' },
    ]);
    expect(r.text).toBe('#000000');
    expect(r.extras).toContain('#111111');
    expect(r.extras).toContain('#222222');
  });
});

describe('resolveRoles — positional fallback', () => {
  it('assigns unroled colors by position bg/surface/accent/text/extra', () => {
    const r = resolveRoles([
      { hex: '#ffffff' }, // bg
      { hex: '#eeeeee' }, // surface
      { hex: '#cc3344' }, // accent
      { hex: '#101010' }, // text
      { hex: '#3355cc' }, // extra
      { hex: '#22aa66' }, // extra
    ]);
    expect(r.bg).toBe('#ffffff');
    expect(r.surface).toBe('#eeeeee');
    expect(r.accent).toBe('#cc3344');
    expect(r.text).toBe('#101010');
    expect(r.extras).toEqual(['#3355cc', '#22aa66']);
  });

  it('fills missing core slots with derived defaults for a 2-color palette', () => {
    const r = resolveRoles([{ hex: '#0a2540' }, { hex: '#ff6b35' }]);
    // bg, surface from the two colors; accent/text derived, never empty.
    expect(r.bg).toBe('#0a2540');
    expect(r.surface).toBe('#ff6b35');
    expect(r.accent).toBeTruthy();
    expect(r.text).toBeTruthy();
  });
});

describe('resolveRoles — contrast auto-pick', () => {
  it('replaces an unreadable text color with a WCAG-AA-passing one over bg', () => {
    // text == bg would be invisible; expect an auto-picked readable fallback.
    const r = resolveRoles([
      { hex: '#ffffff', role: 'bg' },
      { hex: '#fbfbfb', role: 'text' }, // ~no contrast on white
    ]);
    expect(contrastRatio(r.text as Hex, r.bg as Hex)).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps a text color that already passes AA on the bg', () => {
    const r = resolveRoles([
      { hex: '#ffffff', role: 'bg' },
      { hex: '#101010', role: 'text' },
    ]);
    expect(r.text).toBe('#101010');
  });
});

describe('resolveRoles — bad input', () => {
  it('drops un-parseable hexes and still produces a coherent set', () => {
    const r = resolveRoles([
      { hex: 'not-a-color' },
      { hex: '#ff0000' },
    ]);
    expect(r.bg).toBe('#ff0000');
    expect(r.text).toBeTruthy();
    expect(r.accent).toBeTruthy();
  });
});

describe('computeMockVars', () => {
  it('emits every scoped --mock-* var as a valid hex string', () => {
    const vars = computeMockVars([
      { hex: '#0a2540', role: 'bg' },
      { hex: '#1b3a5c', role: 'surface' },
      { hex: '#ff6b35', role: 'accent' },
      { hex: '#f5f5f5', role: 'text' },
    ]);
    for (const value of Object.values(vars)) {
      expect(value).toMatch(/^#[0-9a-f]{6}$/i);
    }
    expect(vars['--mock-bg']).toBe('#0a2540');
    expect(vars['--mock-accent']).toBe('#ff6b35');
  });

  it('always defines all five chart series', () => {
    const vars = computeMockVars([{ hex: '#4040ff' }]);
    for (let i = 0; i < 5; i++) {
      expect(vars[`--mock-chart-${i}` as keyof typeof vars]).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('on-accent foreground passes a usable contrast against accent', () => {
    const vars = computeMockVars([{ hex: '#cccccc', role: 'bg' }, { hex: '#b8431e', role: 'accent' }]);
    const onAccent = vars['--mock-on-accent'] as Hex;
    expect([WHITE, BLACK]).toContain(onAccent);
    expect(contrastRatio(onAccent, vars['--mock-accent'] as Hex)).toBeGreaterThan(2);
  });
});

describe('MOCK_TEMPLATES registry', () => {
  it('seeds exactly the four v1 templates with Cards first (the hero)', () => {
    expect(MOCK_TEMPLATES.map((t) => t.id)).toEqual(['cards', 'website', 'dashboard', 'buttons']);
    expect(HERO_MOCK.id).toBe('cards');
  });

  it('every template has an id, label, and Component', () => {
    for (const t of MOCK_TEMPLATES) {
      expect(typeof t.id).toBe('string');
      expect(typeof t.label).toBe('string');
      expect(typeof t.Component).toBe('function');
    }
  });

  it('getMockTemplate falls back to the hero on an unknown id', () => {
    expect(getMockTemplate('does-not-exist').id).toBe('cards');
    expect(getMockTemplate(null).id).toBe('cards');
    expect(getMockTemplate('website').id).toBe('website');
  });
});
