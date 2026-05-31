/**
 * GET /api/auth/github/callback - verify state, exchange code, fetch the
 * profile + emails, require a GitHub-verified email, find-or-create by email,
 * upsert the oauth link, regenerate the session and set userId.
 */
export const prerender = false;

import type { APIRoute } from 'astro';
import * as arctic from 'arctic';
import { env } from 'cloudflare:workers';
import { resolveOAuthUser } from '../../../../lib/auth/db';
import { pickGithubEmail, type GithubEmail } from '../../../../lib/auth/oauth-profile';
import { STATE_COOKIE } from '../../../../lib/auth/oauth';
import { loginUser } from '../../../../lib/auth/session';

export const GET: APIRoute = async ({ request, cookies, session, redirect }) => {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const storedState = cookies.get(STATE_COOKIE)?.value ?? null;
  cookies.delete(STATE_COOKIE, { path: '/' });

  if (!code || !state || !storedState || state !== storedState) {
    return redirect('/?signin=error', 302);
  }

  let accessToken: string;
  try {
    const github = new arctic.GitHub(
      env.GITHUB_CLIENT_ID,
      env.GITHUB_CLIENT_SECRET,
      `${url.origin}/api/auth/github/callback`,
    );
    const tokens = await github.validateAuthorizationCode(code);
    accessToken = tokens.accessToken();
  } catch {
    return redirect('/?signin=error', 302);
  }

  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'User-Agent': 'UIshades.com',
    Accept: 'application/vnd.github+json',
  };
  const [userRes, emailsRes] = await Promise.all([
    fetch('https://api.github.com/user', { headers }),
    fetch('https://api.github.com/user/emails', { headers }),
  ]);
  if (!userRes.ok || !emailsRes.ok) return redirect('/?signin=error', 302);

  const gh = (await userRes.json()) as {
    id?: number | string;
    login?: string;
    name?: string | null;
    avatar_url?: string | null;
  };
  const emails = (await emailsRes.json()) as GithubEmail[];
  const email = pickGithubEmail(Array.isArray(emails) ? emails : []);
  if (!email || gh.id == null) return redirect('/?signin=unverified', 302);

  const user = await resolveOAuthUser(
    env.DB,
    { provider: 'github', providerUserId: String(gh.id) },
    { email, name: gh.name ?? gh.login ?? null, avatarUrl: gh.avatar_url ?? null },
  );

  if (!session) return redirect('/?signin=error', 302);
  await loginUser(session, user.id);
  return redirect('/', 302);
};
