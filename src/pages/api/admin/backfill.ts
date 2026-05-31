/**
 * One-time, idempotent migration of legacy `presets` rows into 1-color PRIVATE
 * `palettes` (see `backfillPresetsToPalettes`). Exposed as a Worker route rather
 * than a local script because it must run against the SAME D1 - local preview
 * AND remote production - and reuse the unit-tested db helper verbatim (no
 * re-implemented slug/role logic that could drift).
 *
 * INERT BY DEFAULT: with no `ADMIN_BACKFILL_TOKEN` secret set, the route 404s,
 * so it ships dormant. To run it once:
 *   wrangler secret put ADMIN_BACKFILL_TOKEN          # set a long random value
 *   curl -X POST https://uishades.com/api/admin/backfill \
 *        -H "Origin: https://uishades.com" \           # satisfies Astro's CSRF check
 *        -H "x-admin-token: <the value>"
 * The handler is idempotent (re-running creates nothing new), so a retry is
 * safe. Delete this file (and the secret) after the one-time run if you prefer
 * not to keep the surface around.
 */
export const prerender = false;

import { env } from 'cloudflare:workers';
import { backfillPresetsToPalettes } from '../../../lib/auth/db';
import { jsonNoStore } from '../../../lib/auth/http';
import type { APIRoute } from 'astro';

/** Length-aware constant-time-ish compare so the token isn't probeable by timing. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const POST: APIRoute = async ({ request }) => {
  const expected = env.ADMIN_BACKFILL_TOKEN;
  // Not armed → behave as if the route doesn't exist (no enumeration).
  if (!expected) return new Response('Not found', { status: 404 });

  const provided = request.headers.get('x-admin-token') ?? '';
  if (!safeEqual(provided, expected)) return new Response('Not found', { status: 404 });

  const created = await backfillPresetsToPalettes(env.DB);
  return jsonNoStore({ ok: true, created });
};
