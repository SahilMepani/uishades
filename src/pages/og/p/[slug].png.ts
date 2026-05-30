/**
 * /og/p/[slug].png — landscape OG image (1200x630) for a public palette.
 *
 * Mirrors `/og/[hex].png`: rendered on demand via `workers-og`, cached at the
 * edge for 30 days. Only public, non-flagged palettes resolve (the slug is
 * fetched with no viewer, so `getPaletteBySlug` enforces public-only); anything
 * else 404s so a private palette can't unfurl an image.
 */
export const prerender = false;

import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { getPaletteBySlug } from '../../../lib/auth/db';
import { renderPaletteOg } from '../../../lib/og-palette';

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

export const GET: APIRoute = async ({ params }) => {
  const slug = params.slug ?? '';
  if (!SLUG_RE.test(slug)) {
    return new Response('Invalid slug', { status: 404 });
  }
  const palette = await getPaletteBySlug(env.DB, slug);
  if (!palette) {
    return new Response('Not found', { status: 404 });
  }
  return renderPaletteOg(palette.colors.map((c) => c.hex), palette.name, 'landscape');
};
