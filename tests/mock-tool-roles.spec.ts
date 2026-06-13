import { describe, it, expect } from 'vitest';
import { mockColorsForTool } from '../src/components/mocks/tool-roles';
import { computeMockVars, resolveRoles } from '../src/components/mocks/vars';
import { contrastRatio } from '../src/lib/color/contrast';
import type { Hex } from '../src/lib/color/types';

describe('mockColorsForTool — neutral-shell mapping', () => {
  it('routes a lone brand color to accent over a neutral white/#f5f5f5 shell', () => {
    const colors = mockColorsForTool(['#4040ff' as Hex]);
    expect(colors).toEqual([
      { hex: '#4040ff', role: 'accent' },
      { hex: '#f5f5f5', role: 'surface' },
    ]);

    // Resolved through the existing role logic: brand pops as accent; the shell
    // stays neutral (white bg, near-black readable text) — the user's choice.
    const r = resolveRoles(colors);
    expect(r.accent).toBe('#4040ff');
    expect(r.surface).toBe('#f5f5f5');
    expect(r.bg).toBe('#ffffff'); // bg default fills the white shell
    expect(contrastRatio(r.text as Hex, r.bg as Hex)).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps the shell neutral and feeds extra tray colors into the chart series', () => {
    const colors = mockColorsForTool(['#4040ff', '#22aa66', '#ff6b35'] as Hex[]);
    expect(colors.map((c) => c.role)).toEqual(['accent', 'surface', 'extra', 'extra']);

    const vars = computeMockVars(colors);
    expect(vars['--mock-bg']).toBe('#ffffff');
    expect(vars['--mock-accent']).toBe('#4040ff');
    // Every scoped var is a real hex; charts are always defined.
    for (const value of Object.values(vars)) {
      expect(value).toMatch(/^#[0-9a-f]{6}$/i);
    }
    // The extra tray colors surface somewhere in the chart series.
    const charts = [0, 1, 2, 3, 4].map((i) => vars[`--mock-chart-${i}` as keyof typeof vars]);
    expect(charts).toContain('#22aa66');
    expect(charts).toContain('#ff6b35');
  });

  it('returns an empty list for no colors (preview is then hidden)', () => {
    expect(mockColorsForTool([])).toEqual([]);
  });
});
