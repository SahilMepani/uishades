/**
 * DELETE /api/presets/[id] — delete one of the signed-in user's presets.
 * Session-gated via `withUser`; the delete is scoped `WHERE id = ? AND
 * user_id = ?`, so a user can never delete another user's preset.
 */
export const prerender = false;

import { env } from 'cloudflare:workers';
import { deletePreset } from '../../../lib/auth/db';
import { jsonNoStore, withUser } from '../../../lib/auth/http';

export const DELETE = withUser(async ({ params }, userId) => {
  const id = params.id ?? '';
  if (!id) return jsonNoStore({ error: 'bad_request' }, 400);

  const deleted = await deletePreset(env.DB, userId, id);
  return jsonNoStore({ ok: deleted });
});
