/**
 * /api/[hex].json - programmatic ColorPageData for a hex input.
 *
 * Same validation pipeline as the page route: bare hex param, parseColor for
 * canonicalization, 404 on garbage. Returns the shared `ColorPageData` shape
 * so consumers (the React island, third-party callers, scripts) can rely on
 * the contract in `src/lib/color/types.ts`.
 *
 * Edge-cached for 30 days. The endpoint is SSR (no prerender) so we can
 * serve arbitrary hexes without enumerating them at build time.
 */
export const prerender = false;

import type { APIRoute } from 'astro';
import { parseColor, ParseError } from '../../lib/color/parse';
import { oklchRamp } from '../../lib/color/ramp';
import { buildScale } from '../../lib/color/scale';
import type { ColorPageData, Hex } from '../../lib/color/types';

const HEX_RE = /^[0-9a-f]{3}$|^[0-9a-f]{6}$|^[0-9a-f]{8}$/i;

function json(body: unknown, status = 200, cache = false): Response {
  const headers: Record<string, string> = {
    'content-type': 'application/json; charset=utf-8',
  };
  if (cache) {
    headers['cache-control'] = 'public, max-age=2592000';
  }
  return new Response(JSON.stringify(body), { status, headers });
}

export const GET: APIRoute = async ({ params }) => {
  const raw = params.hex ?? '';
  if (!HEX_RE.test(raw)) {
    return json({ error: 'invalid_hex', input: raw }, 404);
  }

  let canonical: Hex;
  try {
    canonical = parseColor(raw);
  } catch (e) {
    if (e instanceof ParseError) {
      return json({ error: 'parse_failed', input: raw }, 404);
    }
    throw e;
  }

  const ramp = oklchRamp(canonical);
  const scale = buildScale(canonical);

  // Neighbor hexes for the SEO/crawl graph. Same 3-up / 3-down policy used by
  // the HTML page - keep them consistent so the JSON consumers see the same
  // link graph the crawler does.
  const lighter: Hex[] = [];
  for (let i = ramp.inputIndex - 1; i >= Math.max(0, ramp.inputIndex - 3); i--) {
    lighter.push(ramp.shades[i].hex);
  }
  const darker: Hex[] = [];
  for (let i = ramp.inputIndex + 1; i <= Math.min(ramp.shades.length - 1, ramp.inputIndex + 3); i++) {
    darker.push(ramp.shades[i].hex);
  }

  const data: ColorPageData = {
    input: canonical,
    ramp,
    scale,
    neighbors: { lighter, darker },
  };

  return json(data, 200, true);
};
