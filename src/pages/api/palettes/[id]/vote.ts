/**
 * POST   /api/palettes/[id]/vote → cast the signed-in user's upvote.
 * DELETE /api/palettes/[id]/vote → remove it.
 *
 * Both session-gated via `withUser` (401 if logged out - voting is itself a
 * signup driver). Returns `{ voteCount, votedByMe }`. One vote per user is
 * enforced by the `palette_votes` PK, so a double-POST is an idempotent no-op
 * (and a DELETE with no prior vote is a harmless no-op).
 *
 * 404 if the palette is missing or not publicly votable: you can only vote on a
 * `public`, non-flagged palette. `getPaletteBySlug`-style visibility doesn't
 * apply here (we have an id, not a slug), so we read the palette and check
 * `visibility === 'public' && !flagged` explicitly - this also stops voting on
 * someone else's private palette or your own private one.
 */
export const prerender = false;

import { env } from 'cloudflare:workers';
import { getPaletteWithColors, unvotePalette, votePalette } from '../../../../lib/auth/db';
import { jsonNoStore, withUser } from '../../../../lib/auth/http';

/** Returns the palette id if it exists AND is publicly votable, else null. */
async function votablePaletteId(id: string): Promise<string | null> {
  const palette = await getPaletteWithColors(env.DB, id);
  if (!palette) return null;
  if (palette.visibility !== 'public' || palette.flagged) return null;
  return palette.id;
}

export const POST = withUser(async ({ params }, userId) => {
  const id = params.id ?? '';
  const votableId = await votablePaletteId(id);
  if (!votableId) return jsonNoStore({ error: 'not_found' }, 404);
  return jsonNoStore(await votePalette(env.DB, userId, votableId));
});

export const DELETE = withUser(async ({ params }, userId) => {
  const id = params.id ?? '';
  const votableId = await votablePaletteId(id);
  if (!votableId) return jsonNoStore({ error: 'not_found' }, 404);
  return jsonNoStore(await unvotePalette(env.DB, userId, votableId));
});
