/**
 * /og/pin/p/[slug].png — portrait (1000x1500) Pinterest OG image for a public
 * palette. Same as the landscape variant but 2:3 portrait so it reads on a
 * Pinterest feed. Public, non-flagged palettes only (404 otherwise).
 */
export const prerender = false;

import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { getPaletteBySlug } from '../../../../lib/auth/db';
import { renderPaletteOg } from '../../../../lib/og-palette';

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
  return renderPaletteOg(palette.colors.map((c) => c.hex), palette.name, 'pin');
};
