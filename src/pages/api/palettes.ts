/**
 * GET  /api/palettes → { palettes[] } - the signed-in user's palette summaries.
 * POST /api/palettes → create a palette, returns { palette }.
 *
 * Both session-gated via `withUser` (401 if logged out); all queries scoped to
 * the user. Validation mirrors `src/pages/api/presets.ts` exactly: `parseColor`
 * is the single entry point for raw hex, and the validated copy/view STRINGS are
 * stored (never the raw value - a crafted array like ["hex"] stringifies to
 * "hex" and would otherwise reach D1's .bind() as an array and throw).
 */
export const prerender = false;

import { env } from 'cloudflare:workers';
import {
  countPalettes,
  createPalette,
  listLikedPalettesByUser,
  listPalettesByUser,
} from '../../lib/auth/db';
import type { NewPaletteColor } from '../../lib/auth/db';
import { jsonNoStore, withUser } from '../../lib/auth/http';
import { parseColor } from '../../lib/color/parse';
import type { CopyFormat, Hex } from '../../lib/color/types';
import { isProfane } from '../../lib/moderation';
import { COPY_VALUES } from '../../lib/url-prefs';

const MAX_PALETTES = 100;
const MIN_COLORS = 1;
const MAX_COLORS = 8;

export const GET = withUser(async ({ url }, userId) => {
  // ?filter=liked → palettes this user has upvoted (the dashboard's "Liked"
  // tab); anything else → the user's own created palettes (the default tab).
  const liked = url.searchParams.get('filter') === 'liked';
  const palettes = liked
    ? await listLikedPalettesByUser(env.DB, userId)
    : await listPalettesByUser(env.DB, userId);
  return jsonNoStore({ palettes });
});

export const POST = withUser(async ({ request }, userId) => {
  let data: Record<string, unknown>;
  try {
    data = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonNoStore({ error: 'bad_request' }, 400);
  }

  const name = String(data.name ?? '').trim().slice(0, 60);
  if (!name) return jsonNoStore({ error: 'name_required' }, 400);
  // Palettes default to public + indexable, so the name is a public string and
  // gets a profanity guard (see src/lib/moderation.ts).
  if (isProfane(name)) return jsonNoStore({ error: 'invalid_name' }, 400);

  // 2–8 colors, each validated through parseColor (canonical #rrggbb) with its
  // per-color view/copyFormat validated against the shared vocabularies. The
  // stored value is always the validated string, never the raw input.
  const rawColors = data.colors;
  if (!Array.isArray(rawColors)) {
    return jsonNoStore({ error: 'colors_required' }, 400);
  }
  if (rawColors.length < MIN_COLORS || rawColors.length > MAX_COLORS) {
    return jsonNoStore({ error: 'invalid_colors' }, 400);
  }

  const colors: NewPaletteColor[] = [];
  for (const raw of rawColors) {
    const c = (raw ?? {}) as Record<string, unknown>;
    let hex: Hex;
    try {
      hex = parseColor(String(c.hex ?? ''));
    } catch {
      return jsonNoStore({ error: 'invalid_hex' }, 400);
    }
    const view: 'scale' | 'ramp' = c.view === 'ramp' ? 'ramp' : 'scale';
    const cf = String(c.copyFormat);
    const copyFormat: CopyFormat = (COPY_VALUES as readonly string[]).includes(cf)
      ? (cf as CopyFormat)
      : 'hex';
    // role is left to the DB's position default (bg/surface/accent/text/extra).
    colors.push({ hex, view, copyFormat });
  }

  if ((await countPalettes(env.DB, userId)) >= MAX_PALETTES) {
    return jsonNoStore({ error: 'limit_reached' }, 400);
  }

  // slug = kebab(name) + 4-char base36 suffix; stable from creation. The
  // `slug UNIQUE` constraint is the final guard against a (rare) collision.
  const slug = `${kebab(name)}-${randomSuffix()}`;

  // visibility defaults to 'public' (every saved palette is reachable by its
  // /p/[slug] share link; the private seam stays at the DB layer only).
  const palette = await createPalette(env.DB, userId, { name, slug, colors });
  return jsonNoStore({ palette }, 201);
});

/** Lowercase, hyphenate, strip non-alphanumerics - the slug stem. */
function kebab(name: string): string {
  const stem = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return stem || 'palette';
}

/** 4-char base36 suffix to keep slugs unique without leaking the palette id. */
function randomSuffix(): string {
  return Math.floor(Math.random() * 36 ** 4)
    .toString(36)
    .padStart(4, '0')
    .slice(-4);
}
