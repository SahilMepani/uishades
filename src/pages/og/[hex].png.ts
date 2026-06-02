/**
 * /og/[hex].png - Open Graph preview image, 1200x630 landscape.
 *
 * Rendered on demand by Cloudflare Workers via `workers-og` (Satori under the
 * hood). Cached at the edge for 30 days. The actual rendering lives in
 * `src/lib/og-render.ts` so the Pinterest 2:3 portrait variant
 * (`/og/[hex]-pin.png`) can share the same composition.
 */
export const prerender = false;

import type { APIRoute } from 'astro';
import { parseColor, ParseError } from '../../lib/color/parse';
import { renderOgImage } from '../../lib/og-render';
import { cachedResponse } from '../../lib/edge-cache';
import type { Hex } from '../../lib/color/types';

const HEX_RE = /^[0-9a-f]{3}$|^[0-9a-f]{6}$|^[0-9a-f]{8}$/i;

export const GET: APIRoute = async ({ params, request }) => {
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

  return cachedResponse(request, () => renderOgImage(canonical, 'landscape'));
};
