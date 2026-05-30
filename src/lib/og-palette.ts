/**
 * Palette OG image renderer.
 *
 * Mirrors `src/lib/og-render.ts` (the per-hex OG card) but renders a saved
 * palette: an evenly split multi-color strip with the palette name and a
 * UIshades wordmark. Two variants share one composition:
 *   - `landscape` (1200x630) — the default og:image / twitter:image.
 *   - `pin` (1000x1500) — Pinterest-optimized 2:3 portrait.
 *
 * Emitted as an HTML string parsed by Satori under `workers-og`, with the same
 * 30-day immutable cache the hex OG endpoint uses.
 */
import { ImageResponse } from 'workers-og';
import { contrastRatio } from './color/contrast';
import type { Hex } from './color/types';

export type OgVariant = 'landscape' | 'pin';

interface VariantSpec {
  width: number;
  height: number;
  stripDirection: 'row' | 'column';
  nameFontSize: number;
  metaFontSize: number;
  wordmarkFontSize: number;
}

const VARIANTS: Record<OgVariant, VariantSpec> = {
  landscape: {
    width: 1200,
    height: 630,
    stripDirection: 'row',
    nameFontSize: 64,
    metaFontSize: 26,
    wordmarkFontSize: 28,
  },
  pin: {
    width: 1000,
    height: 1500,
    stripDirection: 'column',
    nameFontSize: 64,
    metaFontSize: 28,
    wordmarkFontSize: 34,
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

/**
 * Render a palette OG image. `colors` is the ordered hex list (2–8); `name` is
 * the palette title. The strip fills the full frame; a translucent caption bar
 * carries the name + the UIshades wordmark, its ink auto-picked for contrast
 * against the last strip cell.
 */
export function renderPaletteOg(
  colors: Hex[],
  name: string,
  variant: OgVariant = 'landscape',
): Response {
  const spec = VARIANTS[variant];
  const strip = colors.length > 0 ? colors : (['#4040ff'] as Hex[]);

  const stripCells = strip
    .map((h) => `<div style="flex:1; background:${esc(h)};"></div>`)
    .join('');

  // Caption bar sits over the last cell; pick a readable ink against it.
  const captionBg = strip[strip.length - 1];
  const ink = pickInkOver(captionBg);
  const captionFill = ink === '#ffffff' ? 'rgba(10,10,10,0.55)' : 'rgba(255,255,255,0.62)';

  const html = `
    <div style="display:flex; flex-direction:column; width:${spec.width}px; height:${spec.height}px;
                font-family: system-ui, sans-serif; position: relative;">
      <div style="display:flex; flex-direction:${spec.stripDirection}; flex: 1;">
        ${stripCells}
      </div>
      <div style="position:absolute; left:0; right:0; bottom:0;
                  display:flex; align-items:flex-end; justify-content:space-between;
                  padding: 40px 48px; background:${captionFill}; color:${ink};">
        <div style="display:flex; flex-direction:column;">
          <div style="font-size:${spec.metaFontSize}px; opacity:0.75; letter-spacing:0.1em; text-transform:uppercase;">
            Color Palette
          </div>
          <div style="font-size:${spec.nameFontSize}px; font-weight:800; letter-spacing:-0.02em; line-height:1.05;">
            ${esc(name)}
          </div>
        </div>
        <div style="font-size:${spec.wordmarkFontSize}px; font-weight:700; letter-spacing:-0.01em;">
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
