/**
 * Magic-link callback — a two-step confirm to make the GET safe and the login
 * intentional:
 *
 *   GET  /api/auth/magic/callback?token=RAW
 *     Peeks the token WITHOUT consuming it and renders a "Confirm sign-in" page.
 *     Email-security scanners / link prefetchers issue a GET on delivery; a
 *     non-consuming GET means they can't burn the single-use token before the
 *     human clicks. The page shows the (escaped) target email so a victim fed
 *     someone else's link sees the wrong address and bails (login-CSRF guard).
 *
 *   POST (same URL, token in the form body)
 *     Consumes the token (single-use), find-or-creates the user by this
 *     inherently-verified email, regenerates the session, sets userId → home.
 *     Same-origin form POST, so Astro's origin check covers CSRF.
 */
export const prerender = false;

import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { consumeMagicToken, findOrCreateUserByEmail, peekMagicToken } from '../../../../lib/auth/db';
import { escapeHtml } from '../../../../lib/auth/http';
import { loginUser } from '../../../../lib/auth/session';
import { hashToken } from '../../../../lib/auth/tokens';

function confirmPage(email: string, rawToken: string): Response {
  const safeEmail = escapeHtml(email);
  const safeToken = escapeHtml(rawToken);
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Confirm sign-in · uiShades</title>
<style>
  :root { color-scheme: light; }
  body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
    background: #fafaf9; color: #111110; font: 15px/1.6 ui-sans-serif, system-ui, sans-serif; }
  main { width: 100%; max-width: 22rem; padding: 2rem; border: 1px solid #e7e5e4; background: #fff; }
  h1 { margin: 0 0 .75rem; font-size: 1.1rem; }
  p { margin: 0 0 1rem; }
  .email { font-family: ui-monospace, monospace; word-break: break-all; }
  button { width: 100%; padding: .6rem 1rem; border: 1px solid #111110; background: #4040ff; color: #fff;
    font: inherit; font-weight: 600; cursor: pointer; }
  button:hover { background: #3333dd; }
  .muted { color: #78716c; font-size: .8rem; margin: 1rem 0 0; }
</style>
</head>
<body>
  <main>
    <h1>Confirm sign-in</h1>
    <p>Continue signing in to uiShades as <strong class="email">${safeEmail}</strong>?</p>
    <form method="post">
      <input type="hidden" name="token" value="${safeToken}">
      <button type="submit">Sign in</button>
    </form>
    <p class="muted">If that isn't your email address, just close this page.</p>
  </main>
</body>
</html>`;
  return new Response(html, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'private, no-store' },
  });
}

export const GET: APIRoute = async ({ request, redirect }) => {
  const raw = new URL(request.url).searchParams.get('token') ?? '';
  if (!raw) return redirect('/?signin=invalid', 302);

  const email = await peekMagicToken(env.DB, await hashToken(raw));
  if (!email) return redirect('/?signin=expired', 302);

  return confirmPage(email, raw);
};

export const POST: APIRoute = async ({ request, session, redirect }) => {
  let raw = '';
  try {
    const form = await request.formData();
    raw = String(form.get('token') ?? '');
  } catch {
    return redirect('/?signin=invalid', 302);
  }
  if (!raw) return redirect('/?signin=invalid', 302);

  const email = await consumeMagicToken(env.DB, await hashToken(raw));
  if (!email) return redirect('/?signin=expired', 302);

  const user = await findOrCreateUserByEmail(env.DB, { email });
  if (!session) return redirect('/?signin=error', 302);
  await loginUser(session, user.id);

  return redirect('/', 302);
};
