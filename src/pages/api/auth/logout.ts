/**
 * POST /api/auth/logout - destroy the session and clear its cookie. The island
 * clears its local auth state on success; no redirect needed for the fetch.
 */
export const prerender = false;

import type { APIRoute } from 'astro';
import { jsonNoStore } from '../../../lib/auth/http';

export const POST: APIRoute = async ({ session }) => {
  session?.destroy();
  return jsonNoStore({ ok: true });
};
