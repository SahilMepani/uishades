/**
 * GET /api/u/[handle].json — public profile JSON for /u/[handle].
 *
 * Mirrors `/api/p/[slug].json.ts`: SSR, validated param, 404 on miss, and a
 * **public** 30-day edge cache (public data, never per-user — no session is
 * read, so the body is identical for every visitor). Returns a `PublicProfile`:
 * the user's `handle`/`displayName`/`avatarUrl` plus their PUBLIC, non-flagged
 * palettes only.
 *
 * PRIVACY: this response MUST NEVER contain `email`. We build the body by hand
 * from the exact public fields rather than spreading the `User` row, so a future
 * field added to `User` can't leak by accident.
 */
export const prerender = false;

import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { getUserByHandle, listPublicPalettesByUser } from '../../../lib/auth/db';
import type { PublicProfile } from '../../../lib/auth/types';

const HANDLE_RE = /^[a-z0-9_-]{3,30}$/;

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
  const handle = (params.handle ?? '').toLowerCase();
  if (!HANDLE_RE.test(handle)) {
    return json({ error: 'invalid_handle', input: params.handle ?? '' }, 404);
  }

  const user = await getUserByHandle(env.DB, handle);
  // Unknown handle, or a user row whose handle was never set — 404 either way.
  if (!user || !user.handle) {
    return json({ error: 'not_found' }, 404);
  }

  // No viewerId → `votedByMe` is false for everyone (keeps the body cacheable);
  // the signed-in client can re-fetch vote state from /api/explore if needed.
  const palettes = await listPublicPalettesByUser(env.DB, user.id, null);

  // Hand-built body — email is deliberately absent. Only public identity fields.
  const profile: PublicProfile = {
    handle: user.handle,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    palettes,
  };

  return json(profile, 200, true);
};
