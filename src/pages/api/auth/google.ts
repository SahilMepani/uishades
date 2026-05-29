/**
 * GET /api/auth/google — start the Google OAuth redirect flow (with PKCE).
 * Reached via an <a href> (GET), so the CSP `form-action 'self'` is untouched.
 */
export const prerender = false;

import type { APIRoute } from 'astro';
import * as arctic from 'arctic';
import { env } from 'cloudflare:workers';
import { STATE_COOKIE, VERIFIER_COOKIE, oauthCookieOptions } from '../../../lib/auth/oauth';

export const GET: APIRoute = async ({ request, cookies, redirect }) => {
  const origin = new URL(request.url).origin;
  const google = new arctic.Google(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    `${origin}/api/auth/google/callback`,
  );

  const state = arctic.generateState();
  const codeVerifier = arctic.generateCodeVerifier();
  const url = google.createAuthorizationURL(state, codeVerifier, ['openid', 'profile', 'email']);

  const opts = oauthCookieOptions(origin.startsWith('https:'));
  cookies.set(STATE_COOKIE, state, opts);
  cookies.set(VERIFIER_COOKIE, codeVerifier, opts);

  return redirect(url.toString(), 302);
};
