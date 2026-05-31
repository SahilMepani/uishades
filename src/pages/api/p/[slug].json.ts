/**
 * /api/p/[slug].json - public palette JSON for a stable slug.
 *
 * Mirrors the `/api/[hex].json.ts` contract: SSR (no prerender), validated slug
 * param, 404 on miss, and - unlike the user-specific `/api/palettes*` routes -
 * a **public** 30-day edge cache (this is public data, never per-user). Returns
 * only `public`, non-flagged palettes; private/flagged → 404 (no `viewerId` is
 * passed, so `getPaletteBySlug` enforces public-only visibility).
 */
export const prerender = false;

import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { getPaletteBySlug } from '../../../lib/auth/db';

// slug = kebab(name) + 4-char base36 suffix; lowercase alphanumerics + hyphens.
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

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
  const slug = params.slug ?? '';
  if (!SLUG_RE.test(slug)) {
    return json({ error: 'invalid_slug', input: slug }, 404);
  }

  // No viewerId → public-only: a private or flagged palette resolves to NULL.
  const palette = await getPaletteBySlug(env.DB, slug);
  if (!palette) {
    return json({ error: 'not_found', input: slug }, 404);
  }

  return json({ palette }, 200, true);
};
