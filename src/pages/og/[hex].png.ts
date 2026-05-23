/**
 * /og/[hex].png — Open Graph preview image, 1200x630.
 *
 * Rendered on demand by Cloudflare Workers via `workers-og` (Satori under the
 * hood). Cached at the edge for 30 days. We build the layout as an HTML
 * string instead of JSX because the rest of this file stays pure TypeScript,
 * which keeps the Workers bundle small and dodges a Vite JSX transform pass
 * just to render one element.
 *
 * Layout:
 *   - Top 60%: full-bleed solid swatch of the input hex
 *   - Bottom 40%: a strip of 5 sampled shades (extremes, lighter, mid, darker)
 *   - The hex value, large, centered on the swatch in a contrasting color
 *   - "uishades.com" wordmark, bottom-right, also contrast-picked
 */
export const prerender = false;

import type { APIRoute } from 'astro';
import { ImageResponse } from 'workers-og';
import { parseColor, ParseError } from '../../lib/color/parse';
import { oklchRamp } from '../../lib/color/ramp';
import { contrastRatio } from '../../lib/color/contrast';
import type { Hex } from '../../lib/color/types';

const HEX_RE = /^[0-9a-f]{3}$|^[0-9a-f]{6}$|^[0-9a-f]{8}$/i;

/** Pick the better-contrasting text color (white or black) for the given bg. */
function pickInkOver(bg: Hex): '#ffffff' | '#0a0a0a' {
  const white = contrastRatio(bg, '#ffffff');
  const black = contrastRatio(bg, '#0a0a0a');
  return white > black ? '#ffffff' : '#0a0a0a';
}

/** HTML escaping for inline string interpolation. */
function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c] as string));
}

export const GET: APIRoute = async ({ params }) => {
  const raw = params.hex ?? '';
  if (!HEX_RE.test(raw)) {
    return new Response('Invalid hex', { status: 404 });
  }

  let canonical: Hex;
  try {
    canonical = parseColor(raw);
  } catch (e) {
    if (e instanceof ParseError) {
      return new Response('Invalid hex', { status: 404 });
    }
    throw e;
  }

  const ramp = oklchRamp(canonical);
  // Sample 5 strip shades from the 22-entry ramp: very light, lighter,
  // input itself, darker, very dark.
  const ix = ramp.inputIndex;
  const stripIndices = [
    Math.max(1, Math.floor(ix * 0.25)),       // very light (skip pure white at 0)
    Math.max(1, Math.floor(ix * 0.65)),       // lighter
    ix,                                       // input
    Math.min(20, Math.ceil(ix + (21 - ix) * 0.35)), // darker
    Math.min(20, Math.ceil(ix + (21 - ix) * 0.75)), // very dark (skip pure black at 21)
  ];
  const strip = stripIndices.map((i) => ramp.shades[i].hex);

  const ink = pickInkOver(canonical);
  const wordmarkInk = pickInkOver(strip[strip.length - 1]);
  const hexLabel = canonical.toUpperCase();

  const stripCells = strip
    .map((h) => `<div style="flex:1; background:${esc(h)};"></div>`)
    .join('');

  const html = `
    <div style="display:flex; flex-direction:column; width:1200px; height:630px;
                font-family: system-ui, sans-serif;">
      <div style="display:flex; align-items:center; justify-content:center;
                  flex: 0 0 60%; background:${esc(canonical)}; color:${ink};">
        <div style="display:flex; flex-direction:column; align-items:center;">
          <div style="font-size: 28px; opacity: 0.7; letter-spacing: 0.1em;">
            HEX COLOR
          </div>
          <div style="font-family: 'Menlo', 'Consolas', monospace; font-size: 180px;
                      font-weight: 800; letter-spacing: -0.04em; line-height: 1;">
            ${esc(hexLabel)}
          </div>
        </div>
      </div>
      <div style="display:flex; flex: 1; position: relative;">
        ${stripCells}
        <div style="position:absolute; right: 32px; bottom: 24px; color:${wordmarkInk};
                    font-size: 28px; font-weight: 700; letter-spacing: -0.01em;">
          uishades.com
        </div>
      </div>
    </div>
  `;

  // workers-og emits its own default Cache-Control. If we pass one via the
  // constructor's `headers` option it gets appended alongside the default,
  // producing a duplicated `Cache-Control` header on the wire that some
  // CDN / browser combos handle by taking the most-restrictive value
  // (often `no-store`), wiping the long-cache intent. Construct the
  // response without a `headers` option, then `.set()` after so we own
  // exactly one Cache-Control value.
  const resp = new ImageResponse(html, {
    width: 1200,
    height: 630,
    format: 'png',
  });
  resp.headers.set('Cache-Control', 'public, max-age=2592000, immutable');
  return resp;
};
