/**
 * `colorPageMarkdown` - renders a `ColorPageData` as a clean, agent-friendly
 * markdown document.
 *
 * Served on `/` and `/[hex]` when the request carries `Accept: text/markdown`
 * (the "Markdown for Agents" content-negotiation standard). The same ramp /
 * scale / neighbor data the HTML page renders, flattened to markdown tables so
 * an LLM can read the palette without executing the React island.
 *
 * Intentionally uses `findByHexSlim` (name only, no editorial blurb) so this
 * module stays light enough to live on the eager SSR path and be reused by the
 * MCP tool. `data.input` must be a canonical `Hex`.
 */
import { contrastRatio, wcagLevel } from '../color/contrast';
import { findByHexSlim } from '../data/named-colors-slim';
import type { ColorPageData, OKLCH, Shade } from '../color/types';

const SITE = 'https://uishades.com';

/** Compact CSS-style `oklch(L C H)` string; achromatic hues print `none`. */
function fmtOklch(o: OKLCH): string {
  const h = Number.isNaN(o.h) ? 'none' : o.h.toFixed(1);
  return `oklch(${o.l.toFixed(3)} ${o.c.toFixed(3)} ${h})`;
}

/** "5.4:1 (AA)" contrast cell against a backdrop. */
function contrastCell(hex: string, against: string): string {
  const ratio = contrastRatio(hex, against);
  return `${ratio.toFixed(2)}:1 (${wcagLevel(ratio)})`;
}

function scaleRow(s: Shade): string {
  const label = s.isInput ? `**${s.stop}**` : `${s.stop}`;
  return `| ${label} | \`${s.hex}\` | \`${fmtOklch(s.oklch)}\` | ${contrastCell(
    s.hex,
    '#ffffff',
  )} | ${contrastCell(s.hex, '#000000')} |`;
}

function rampRow(s: Shade, i: number): string {
  const marker = s.isInput ? ' ⬅ input' : '';
  return `| ${i + 1} | \`${s.hex}\`${marker} | \`${fmtOklch(s.oklch)}\` |`;
}

function neighborLinks(hexes: string[]): string {
  if (hexes.length === 0) return '_none_';
  return hexes.map((h) => `[\`${h}\`](${SITE}/${h.slice(1)})`).join(', ');
}

export function colorPageMarkdown(data: ColorPageData): string {
  const hex = data.input;
  const bare = hex.slice(1);
  const named = findByHexSlim(hex);
  const title = named ? `${named.name} (${hex.toUpperCase()})` : hex.toUpperCase();

  const lines: string[] = [];
  lines.push(`# ${title} — tints & shades`);
  lines.push('');
  lines.push(
    named
      ? `\`${hex}\` is the CSS named color **${named.name}**. Below are its perceptual OKLCH ramp and 11-stop Tailwind scale, with WCAG contrast for every shade.`
      : `Perceptual OKLCH ramp and 11-stop Tailwind scale for \`${hex}\`, with WCAG contrast for every shade.`,
  );
  lines.push('');
  lines.push(`- Canonical URL: ${SITE}/${bare}`);
  lines.push(`- JSON: ${SITE}/api/${bare}.json`);
  lines.push(`- Anchored at Tailwind stop **${data.scale.anchorStop}**`);
  lines.push('');

  lines.push('## Tailwind scale (50–950)');
  lines.push('');
  lines.push('| Stop | Hex | OKLCH | Contrast vs white | Contrast vs black |');
  lines.push('| ---: | --- | --- | --- | --- |');
  for (const s of data.scale.shades) lines.push(scaleRow(s));
  lines.push('');
  lines.push('_The bold stop is the input color, snapped to its nearest stop._');
  lines.push('');

  lines.push('## OKLCH ramp (20 steps, lightest → darkest)');
  lines.push('');
  lines.push('| # | Hex | OKLCH |');
  lines.push('| ---: | --- | --- |');
  data.ramp.shades.forEach((s, i) => lines.push(rampRow(s, i)));
  lines.push('');

  lines.push('## Nearby colors');
  lines.push('');
  lines.push(`- Lighter: ${neighborLinks(data.neighbors.lighter)}`);
  lines.push(`- Darker: ${neighborLinks(data.neighbors.darker)}`);
  lines.push('');

  lines.push('## Use programmatically');
  lines.push('');
  lines.push(`- **JSON API**: \`GET ${SITE}/api/${bare}.json\` returns this same data.`);
  lines.push(
    `- **MCP**: \`${SITE}/mcp\` (streamable HTTP) exposes a \`generate_shades\` tool that accepts any hex, \`rgb()\`, \`hsl()\`, \`oklch()\`, or CSS color name.`,
  );
  lines.push('');

  return lines.join('\n');
}
