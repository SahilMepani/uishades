/**
 * /og/pin/[hex].png - Pinterest-optimized 2:3 portrait variant (1000x1500).
 *
 * Pinterest's pin grid is portrait-first; landscape OG cards crop or shrink
 * in the feed. This endpoint mirrors the standard /og/[hex].png composition
 * but at 1000x1500 with the shade strip stacked vertically beneath the
 * swatch. Used as the `media=` parameter on the ShareRow's Pinterest button
 * and as a secondary og:image hint in [hex].astro / colors/[name].astro.
 *
 * A subfolder (/og/pin/...) is used instead of a "-pin" suffix on the same
 * segment so the route is unambiguous relative to /og/[hex].png - Astro
 * route matching only resolves cleanly when literal-vs-param segments
 * don't overlap.
 */
export const prerender = false;

import type { APIRoute } from 'astro';
import { parseColor, ParseError } from '../../../lib/color/parse';
import { renderOgImage } from '../../../lib/og-render';
import type { Hex } from '../../../lib/color/types';

const HEX_RE = /^[0-9a-f]{3}$|^[0-9a-f]{6}$|^[0-9a-f]{8}$/i;

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

  return renderOgImage(canonical, 'pin');
};
