/**
 * GET /api/auth/google/callback — verify state, exchange code, require a
 * Google-verified email, find-or-create by email, upsert the oauth link, then
 * regenerate the session and set userId.
 */
export const prerender = false;

import type { APIRoute } from 'astro';
import * as arctic from 'arctic';
import { env } from 'cloudflare:workers';
import { resolveOAuthUser } from '../../../../lib/auth/db';
import { googleProfile } from '../../../../lib/auth/oauth-profile';
import { STATE_COOKIE, VERIFIER_COOKIE } from '../../../../lib/auth/oauth';
import { loginUser } from '../../../../lib/auth/session';

export const GET: APIRoute = async ({ request, cookies, session, redirect }) => {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const storedState = cookies.get(STATE_COOKIE)?.value ?? null;
  const codeVerifier = cookies.get(VERIFIER_COOKIE)?.value ?? null;
  cookies.delete(STATE_COOKIE, { path: '/' });
  cookies.delete(VERIFIER_COOKIE, { path: '/' });

  if (!code || !state || !storedState || state !== storedState || !codeVerifier) {
    return redirect('/?signin=error', 302);
  }

  let claims: unknown;
  try {
    const google = new arctic.Google(
      env.GOOGLE_CLIENT_ID,
      env.GOOGLE_CLIENT_SECRET,
      `${url.origin}/api/auth/google/callback`,
    );
    const tokens = await google.validateAuthorizationCode(code, codeVerifier);
    const idToken = tokens.idToken();
    if (!idToken) return redirect('/?signin=error', 302);
    claims = arctic.decodeIdToken(idToken);
  } catch {
    return redirect('/?signin=error', 302);
  }

  const profile = googleProfile(claims as Record<string, unknown>);
  if (!profile) return redirect('/?signin=unverified', 302);

  const user = await resolveOAuthUser(
    env.DB,
    { provider: 'google', providerUserId: profile.providerUserId },
    { email: profile.email, name: profile.name, avatarUrl: profile.avatarUrl },
  );

  if (!session) return redirect('/?signin=error', 302);
  await loginUser(session, user.id);
  return redirect('/', 302);
};
