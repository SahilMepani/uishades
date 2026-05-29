/**
 * Shared OG image renderer.
 *
 * Two variants:
 *   - `landscape` (1200x630): used by the default `/og/[hex].png` endpoint
 *     for og:image / twitter:image. Horizontal layout, swatch on top,
 *     5-strip row on bottom.
 *   - `pin` (1000x1500): Pinterest-optimized 2:3 portrait. Same composition
 *     but with the strip stacked vertically so the card reads on a Pinterest
 *     feed where portrait images dominate.
 *
 * Both layouts are emitted as HTML strings (Satori under workers-og parses
 * them), and inherit the existing single-Cache-Control treatment from the
 * landscape endpoint — see the comment in [hex].png.ts for why we set the
 * header after construction rather than in the options.
 */
import { ImageResponse } from 'workers-og';
import { oklchRamp } from './color/ramp';
import { contrastRatio } from './color/contrast';
import { ogStripIndices } from './og-strip';
import type { Hex } from './color/types';

export type OgVariant = 'landscape' | 'pin';

interface VariantSpec {
  width: number;
  height: number;
  swatchPct: number;
  hexFontSize: number;
  eyebrowFontSize: number;
  wordmarkFontSize: number;
  stripDirection: 'row' | 'column';
}

const VARIANTS: Record<OgVariant, VariantSpec> = {
  landscape: {
    width: 1200,
    height: 630,
    swatchPct: 60,
    hexFontSize: 180,
    eyebrowFontSize: 28,
    wordmarkFontSize: 28,
    stripDirection: 'row',
  },
  pin: {
    width: 1000,
    height: 1500,
    swatchPct: 70,
    hexFontSize: 160,
    eyebrowFontSize: 28,
    wordmarkFontSize: 34,
    stripDirection: 'column',
  },
};

function pickInkOver(bg: Hex): '#ffffff' | '#0a0a0a' {
  const white = contrastRatio(bg, '#ffffff');
  const black = contrastRatio(bg, '#0a0a0a');
  return white > black ? '#ffffff' : '#0a0a0a';
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c] as string));
}

export function renderOgImage(canonical: Hex, variant: OgVariant = 'landscape'): Response {
  const spec = VARIANTS[variant];

  const ramp = oklchRamp(canonical);
  const ix = ramp.inputIndex;
  const stripIndices = ogStripIndices(ix, ramp.shades.length);
  const strip = stripIndices.map((i) => ramp.shades[i].hex);

  const ink = pickInkOver(canonical);
  const wordmarkInk = pickInkOver(strip[strip.length - 1]);
  const hexLabel = canonical.toUpperCase();

  const stripCells = strip
    .map((h) => `<div style="flex:1; background:${esc(h)};"></div>`)
    .join('');

  const html = `
    <div style="display:flex; flex-direction:column; width:${spec.width}px; height:${spec.height}px;
                font-family: system-ui, sans-serif;">
      <div style="display:flex; align-items:center; justify-content:center;
                  flex: 0 0 ${spec.swatchPct}%; background:${esc(canonical)}; color:${ink};">
        <div style="display:flex; flex-direction:column; align-items:center;">
          <div style="font-size: ${spec.eyebrowFontSize}px; opacity: 0.7; letter-spacing: 0.1em;">
            HEX COLOR
          </div>
          <div style="font-family: 'Menlo', 'Consolas', monospace; font-size: ${spec.hexFontSize}px;
                      font-weight: 800; letter-spacing: -0.04em; line-height: 1;">
            ${esc(hexLabel)}
          </div>
        </div>
      </div>
      <div style="display:flex; flex-direction:${spec.stripDirection}; flex: 1; position: relative;">
        ${stripCells}
        <div style="position:absolute; right: 32px; bottom: 24px; color:${wordmarkInk};
                    font-size: ${spec.wordmarkFontSize}px; font-weight: 700; letter-spacing: -0.01em;">
          UIshades.com
        </div>
      </div>
    </div>
  `;

  const resp = new ImageResponse(html, {
    width: spec.width,
    height: spec.height,
    format: 'png',
  });
  resp.headers.set('Cache-Control', 'public, max-age=2592000, immutable');
  return resp;
}
