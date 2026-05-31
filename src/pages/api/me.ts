/**
 * GET /api/me - the island's auth probe. Returns `{ user|null, presets[] }`.
 * Logged-out is a 200 with `user: null` (this is the "am I signed in?" check,
 * not a gate). Always `private, no-store` so the edge never caches it.
 */
export const prerender = false;

import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { getUserById, listPresets } from '../../lib/auth/db';
import { jsonNoStore } from '../../lib/auth/http';
import { currentUserId } from '../../lib/auth/session';
import type { MeResponse } from '../../lib/auth/types';

export const GET: APIRoute = async ({ session }) => {
  const userId = await currentUserId(session);
  if (!userId)
    return jsonNoStore({ user: null, presets: [], plan: 'free' } satisfies MeResponse);

  // The user row and the preset list both key off the session userId, so the
  // two D1 round-trips are independent - run them together.
  const [user, presets] = await Promise.all([
    getUserById(env.DB, userId),
    listPresets(env.DB, userId),
  ]);

  const body: MeResponse = user
    ? {
        user: { email: user.email, name: user.name, avatarUrl: user.avatarUrl },
        presets,
        plan: user.plan,
      }
    : { user: null, presets: [], plan: 'free' };
  return jsonNoStore(body);
};
