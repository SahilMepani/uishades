/**
 * GET    /api/palettes/[id] - the owner's full palette (colors joined).
 * PATCH  /api/palettes/[id] - rename / re-describe / reorder colors / edit roles.
 * DELETE /api/palettes/[id] - owner-scoped delete.
 *
 * All session-gated via `withUser`; every query is owner-scoped, so a user can
 * never read, mutate, or delete another user's palette. Color validation mirrors
 * `src/pages/api/presets.ts` (parseColor + validated copy/view strings).
 *
 * `visibility='private'` is REJECTED in v1 (billing deferred): the request gets
 * a 400 `{ error: 'pro_required' }` placeholder - this is the exact seam where
 * the future `isPro` 402 gate lands.
 */
export const prerender = false;

import { env } from 'cloudflare:workers';
import {
  deletePalette,
  getPaletteWithColors,
  updatePalette,
} from '../../../lib/auth/db';
import type { NewPaletteColor, PalettePatch } from '../../../lib/auth/db';
import { jsonNoStore, withUser } from '../../../lib/auth/http';
import { parseColor } from '../../../lib/color/parse';
import type { CopyFormat, Hex } from '../../../lib/color/types';
import type { PaletteRole } from '../../../lib/auth/types';
import { isProfane } from '../../../lib/moderation';
import { COPY_VALUES } from '../../../lib/url-prefs';

const MIN_COLORS = 1;
const MAX_COLORS = 8;
const ROLE_VALUES: readonly PaletteRole[] = ['bg', 'surface', 'accent', 'text', 'extra'] as const;

export const GET = withUser(async ({ params }, userId) => {
  const id = params.id ?? '';
  if (!id) return jsonNoStore({ error: 'bad_request' }, 400);

  const palette = await getPaletteWithColors(env.DB, id);
  // 404 (not 403) when the palette is missing OR not the caller's - don't leak
  // the existence of another user's palette.
  if (!palette || !(await isOwner(id, userId))) {
    return jsonNoStore({ error: 'not_found' }, 404);
  }

  return jsonNoStore({ palette });
});

export const PATCH = withUser(async ({ request, params }, userId) => {
  const id = params.id ?? '';
  if (!id) return jsonNoStore({ error: 'bad_request' }, 400);

  let data: Record<string, unknown>;
  try {
    data = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonNoStore({ error: 'bad_request' }, 400);
  }

  // Private visibility is the future-Pro seam - reject in v1 (billing deferred).
  if (data.visibility !== undefined && data.visibility !== 'public') {
    return jsonNoStore({ error: 'pro_required' }, 400);
  }

  const patch: PalettePatch = {};

  if (data.name !== undefined) {
    const name = String(data.name ?? '').trim().slice(0, 60);
    if (!name) return jsonNoStore({ error: 'name_required' }, 400);
    // Renaming a public palette: same profanity guard as create.
    if (isProfane(name)) return jsonNoStore({ error: 'invalid_name' }, 400);
    patch.name = name;
  }

  if (data.description !== undefined) {
    patch.description =
      data.description === null ? null : String(data.description).slice(0, 280) || null;
  }

  if (data.colors !== undefined) {
    const rawColors = data.colors;
    if (!Array.isArray(rawColors)) {
      return jsonNoStore({ error: 'invalid_colors' }, 400);
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
      // role: store the validated string; an unknown/absent role falls to the
      // DB's position default (bg/surface/accent/text/extra).
      const role: PaletteRole | undefined = (ROLE_VALUES as readonly string[]).includes(
        String(c.role),
      )
        ? (String(c.role) as PaletteRole)
        : undefined;
      colors.push(role !== undefined ? { hex, view, copyFormat, role } : { hex, view, copyFormat });
    }
    patch.colors = colors;
  }

  const updated = await updatePalette(env.DB, userId, id, patch);
  // NULL when the caller doesn't own a palette with that id - 404, don't leak.
  if (!updated) return jsonNoStore({ error: 'not_found' }, 404);

  return jsonNoStore({ palette: updated });
});

export const DELETE = withUser(async ({ params }, userId) => {
  const id = params.id ?? '';
  if (!id) return jsonNoStore({ error: 'bad_request' }, 400);

  const deleted = await deletePalette(env.DB, userId, id);
  return jsonNoStore({ ok: deleted });
});

/** True only if `id` is a palette owned by `userId` (no cross-user leak). */
async function isOwner(id: string, userId: string): Promise<boolean> {
  const row = await env.DB.prepare('SELECT 1 AS x FROM palettes WHERE id = ? AND user_id = ?')
    .bind(id, userId)
    .first<{ x: number }>();
  return row != null;
}
