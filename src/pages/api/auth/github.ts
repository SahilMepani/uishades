/**
 * GET /api/auth/github — start the GitHub OAuth redirect flow. No PKCE (GitHub
 * doesn't support it for OAuth apps); state-only CSRF protection. Reached via an
 * <a href> (GET), so CSP `form-action 'self'` is untouched.
 */
export const prerender = false;

import type { APIRoute } from 'astro';
import * as arctic from 'arctic';
import { env } from 'cloudflare:workers';
import { STATE_COOKIE, oauthCookieOptions } from '../../../lib/auth/oauth';

export const GET: APIRoute = async ({ request, cookies, redirect }) => {
  const origin = new URL(request.url).origin;
  const github = new arctic.GitHub(
    env.GITHUB_CLIENT_ID,
    env.GITHUB_CLIENT_SECRET,
    `${origin}/api/auth/github/callback`,
  );

  const state = arctic.generateState();
  const url = github.createAuthorizationURL(state, ['user:email']);

  cookies.set(STATE_COOKIE, state, oauthCookieOptions(origin.startsWith('https:')));

  return redirect(url.toString(), 302);
};
