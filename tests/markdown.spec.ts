/**
 * Unit tests for `colorPageMarkdown` (src/lib/markdown/color-page.ts).
 *
 * Exercises the agent-facing markdown rendering for both a CSS-named hex
 * (Alice Blue / #f0f8ff) and an arbitrary, unnamed hex, asserting the
 * machine-readable surface contract: a top-level heading, the Tailwind /
 * OKLCH section headers, the published JSON API URL, the /mcp reference,
 * and that the input shade is visibly marked.
 */
import { describe, it, expect } from 'vitest';
import { colorPageMarkdown } from '../src/lib/markdown/color-page';
import { buildColorPageData } from '../src/lib/color/page-data';
import { parseColor } from '../src/lib/color/parse';

describe('colorPageMarkdown — named hex (#f0f8ff / Alice Blue)', () => {
  const md = colorPageMarkdown(buildColorPageData(parseColor('#f0f8ff')));

  it('contains the hex', () => {
    expect(md.toLowerCase()).toContain('#f0f8ff');
  });

  it('opens with a top-level "# " heading', () => {
    expect(md.startsWith('# ')).toBe(true);
  });

  it('surfaces the CSS color name', () => {
    expect(md).toContain('Alice Blue');
  });

  it('has a Tailwind scale section header', () => {
    expect(md).toMatch(/^##\s+Tailwind scale/m);
  });

  it('has an OKLCH ramp section header', () => {
    expect(md).toMatch(/^##\s+OKLCH ramp/m);
  });

  it('links to the public JSON API URL', () => {
    expect(md).toContain('https://uishades.com/api/f0f8ff.json');
  });

  it('references the /mcp endpoint', () => {
    expect(md).toContain('https://uishades.com/mcp');
  });

  it('marks the input shade (bold stop + ⬅ input marker)', () => {
    const data = buildColorPageData(parseColor('#f0f8ff'));
    const inputStop = data.scale.shades.find((s) => s.isInput)!.stop;
    expect(md).toContain(`**${inputStop}**`);
    expect(md).toContain('⬅ input');
  });
});

describe('colorPageMarkdown — arbitrary hex (#4040ff)', () => {
  const md = colorPageMarkdown(buildColorPageData(parseColor('#4040ff')));

  it('contains the hex', () => {
    expect(md.toLowerCase()).toContain('#4040ff');
  });

  it('opens with a top-level "# " heading', () => {
    expect(md.startsWith('# ')).toBe(true);
  });

  it('has both the Tailwind scale and OKLCH ramp section headers', () => {
    expect(md).toMatch(/^##\s+Tailwind scale/m);
    expect(md).toMatch(/^##\s+OKLCH ramp/m);
  });

  it('links to the per-hex JSON API URL', () => {
    expect(md).toContain('https://uishades.com/api/4040ff.json');
  });

  it('references the /mcp endpoint', () => {
    expect(md).toContain('https://uishades.com/mcp');
  });

  it('marks the input shade', () => {
    const data = buildColorPageData(parseColor('#4040ff'));
    const inputStop = data.scale.shades.find((s) => s.isInput)!.stop;
    expect(md).toContain(`**${inputStop}**`);
    expect(md).toContain('⬅ input');
  });
});
