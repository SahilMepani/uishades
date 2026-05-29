/**
 * JSON responses for auth/preset endpoints. `private, no-store` is mandatory:
 * this zone caches `/[hex]` HTML at the edge for 30 days, so any per-user
 * response MUST opt out of caching to avoid leaking one user's state to others.
 * (The middleware also force-sets `private, no-store` on the user-specific
 * `/api/*` prefixes as a structural backstop, but keeping it here is explicit.)
 */
import type { APIContext, APIRoute } from 'astro';
import { currentUserId } from './session';

export function jsonNoStore(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'private, no-store',
    },
  });
}

export function unauthorized(): Response {
  return jsonNoStore({ error: 'unauthorized' }, 401);
}

/**
 * Escape a string for safe interpolation into HTML text or a double-quoted
 * attribute. Used by the magic-link confirm page and the email body — any
 * value derived (even indirectly) from user input that lands in markup MUST
 * go through this.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Gate an API handler behind a logged-in session. Centralizes the
 * `currentUserId` + 401 check so a protected route is authenticated by
 * construction (and the userId is injected, not re-derived per route) — a new
 * endpoint can't forget the guard.
 */
export function withUser(
  handler: (context: APIContext, userId: string) => Response | Promise<Response>,
): APIRoute {
  return async (context) => {
    const userId = await currentUserId(context.session);
    if (!userId) return unauthorized();
    return handler(context, userId);
  };
}
