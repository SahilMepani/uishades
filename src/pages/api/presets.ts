/**
 * GET /api/presets  → { presets[] } for the signed-in user.
 * POST /api/presets → create a preset, returns { preset }.
 * Both session-gated via `withUser` (401 if logged out); all queries scoped to
 * the user.
 */
export const prerender = false;

import { env } from 'cloudflare:workers';
import { countPresets, createPreset, listPresets } from '../../lib/auth/db';
import { jsonNoStore, withUser } from '../../lib/auth/http';
import { parseColor } from '../../lib/color/parse';
import type { CopyFormat, ExportFormat, Hex } from '../../lib/color/types';
import { COPY_VALUES, FMT_VALUES } from '../../lib/url-prefs';

const MAX_PRESETS = 100;

export const GET = withUser(async (_context, userId) => {
  return jsonNoStore({ presets: await listPresets(env.DB, userId) });
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

  // parseColor is the single entry point for raw color input - it canonicalizes
  // (and gamut-maps) any CSS color to `#rrggbb`, so the stored value always
  // matches the Hex contract instead of a per-route regex that can drift.
  let hex: Hex;
  try {
    hex = parseColor(String(data.hex ?? ''));
  } catch {
    return jsonNoStore({ error: 'invalid_hex' }, 400);
  }

  const view = data.view === 'ramp' ? 'ramp' : 'scale';
  // Validate against the shared vocabularies and store the validated STRING -
  // never the raw value (a crafted array like ["hex"] stringifies to "hex" and
  // would otherwise reach D1's .bind() as an array and throw).
  const cf = String(data.copyFormat);
  const copyFormat: CopyFormat = (COPY_VALUES as readonly string[]).includes(cf)
    ? (cf as CopyFormat)
    : 'hex';
  const ef = String(data.exportFormat);
  const exportFormat: ExportFormat | undefined = (FMT_VALUES as readonly string[]).includes(ef)
    ? (ef as ExportFormat)
    : undefined;

  if ((await countPresets(env.DB, userId)) >= MAX_PRESETS) {
    return jsonNoStore({ error: 'limit_reached' }, 400);
  }

  const preset = await createPreset(env.DB, userId, { name, hex, view, copyFormat, exportFormat });
  return jsonNoStore({ preset }, 201);
});
