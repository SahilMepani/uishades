/**
 * POST /api/me/handle — set (or update) the signed-in user's public handle +
 * display name. Session-gated via `withUser`.
 *
 * The handle is the public URL key for `/u/[handle]` (Phase 2 surfaces it; the
 * endpoint ships now). Validated `^[a-z0-9_-]{3,30}$`; uniqueness is enforced by
 * the `idx_users_handle` UNIQUE index, which `setUserHandle` catches and surfaces
 * as `false` — the same race-safe pattern `findOrCreateUserByEmail` uses for the
 * UNIQUE(email) constraint. A taken handle returns 409.
 */
export const prerender = false;

import { env } from 'cloudflare:workers';
import { getUserById, setUserHandle } from '../../../lib/auth/db';
import { jsonNoStore, withUser } from '../../../lib/auth/http';
import { isProfane } from '../../../lib/moderation';

const HANDLE_RE = /^[a-z0-9_-]{3,30}$/;

export const POST = withUser(async ({ request }, userId) => {
  let data: Record<string, unknown>;
  try {
    data = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonNoStore({ error: 'bad_request' }, 400);
  }

  const handle = String(data.handle ?? '').trim().toLowerCase();
  if (!HANDLE_RE.test(handle) || isProfane(handle)) {
    return jsonNoStore({ error: 'invalid_handle' }, 400);
  }

  // displayName is optional; falls back to the handle on cards when null.
  const displayName =
    data.displayName === undefined || data.displayName === null
      ? null
      : String(data.displayName).trim().slice(0, 60) || null;
  // Both handle and display name appear publicly under our domain — guard both.
  if (displayName && isProfane(displayName)) {
    return jsonNoStore({ error: 'invalid_name' }, 400);
  }

  // `setUserHandle` returns false on a UNIQUE(handle) collision (taken by
  // someone else) — but also when the UPDATE matched the row yet changed nothing
  // (re-submitting the exact same handle+displayName). Disambiguate by reading
  // back the user: if they now own this handle it's a no-op success, otherwise
  // the handle is genuinely taken → 409.
  const ok = await setUserHandle(env.DB, userId, handle, displayName);
  const user = await getUserById(env.DB, userId);
  if (!ok && user?.handle !== handle) {
    return jsonNoStore({ error: 'handle_taken' }, 409);
  }

  return jsonNoStore({ handle: user?.handle ?? handle, displayName: user?.displayName ?? displayName });
});
