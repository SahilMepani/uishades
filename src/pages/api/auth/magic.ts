/**
 * POST /api/auth/magic { email } - request a passwordless sign-in link.
 *
 * Rate-limited per-email and per-IP (5/hour) so nobody can burn the Brevo quota
 * or spam a victim's inbox. We store only sha256(token); the raw token rides in
 * the emailed URL and is single-use with a 15-min TTL. Always responds the same
 * for valid input (no account enumeration).
 */
export const prerender = false;

import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import {
  countRecentMagicRequests,
  deleteMagicRequestById,
  deleteMagicToken,
  pruneExpiredMagicTokens,
  pruneMagicRequests,
  recordMagicRequest,
  storeMagicToken,
} from '../../../lib/auth/db';
import { sendMagicLinkEmail } from '../../../lib/auth/email';
import { jsonNoStore } from '../../../lib/auth/http';
import { normalizeEmail } from '../../../lib/auth/normalize';
import { generateToken, hashToken, MAGIC_TTL_MS } from '../../../lib/auth/tokens';

const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const RATE_MAX = 5;
// Exclude HTML-dangerous chars (in addition to whitespace/@): the address is
// later rendered into the confirm page, so this is defense-in-depth on top of
// the output-escaping there.
const EMAIL_RE = /^[^\s@<>"'`]+@[^\s@<>"'`]+\.[^\s@<>"'`]+$/;

// The emailed link must point at the canonical site, never the request Host:
// the Worker can be reached on *.workers.dev / preview hostnames, and we don't
// want a sign-in link riding an off-brand origin. Localhost keeps the request
// origin so the link is clickable in local dev.
function magicLinkOrigin(request: Request): string {
  const origin = new URL(request.url).origin;
  const { hostname } = new URL(origin);
  if (hostname === 'localhost' || hostname === '127.0.0.1') return origin;
  return 'https://uishades.com';
}

export const POST: APIRoute = async ({ request }) => {
  let email = '';
  try {
    const data = (await request.json()) as { email?: unknown };
    email = normalizeEmail(String(data?.email ?? ''));
  } catch {
    return jsonNoStore({ error: 'bad_request' }, 400);
  }
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return jsonNoStore({ error: 'invalid_email' }, 400);
  }

  const db = env.DB;
  const now = Date.now();
  const windowStart = now - RATE_WINDOW_MS;
  // Prune both throttling rows and expired tokens (the latter are otherwise
  // never GC'd, since consume only deletes the row that's actually opened).
  await Promise.all([pruneMagicRequests(db, windowStart), pruneExpiredMagicTokens(db, now)]);

  const ip = request.headers.get('CF-Connecting-IP') ?? 'local';
  const emailKey = `email:${email}`;
  const ipKey = `ip:${ip}`;

  // Record-then-check (vs the old check-then-record): insert BOTH attempt rows
  // first, then count the in-window total, which now includes the just-inserted
  // attempt. This closes a TOCTOU where N parallel POSTs could all read a count
  // below the cap and pass the gate; a concurrent burst now fails CLOSED. We
  // gate with `>` (strictly greater) since the count includes this attempt, and
  // roll back BOTH rows on an over-cap so a denied attempt holds no slot. Net
  // invariant: the window reflects only SUCCESSFUL sends, so 5 sequential
  // succeed and the 6th 429s.
  const [emailId, ipId] = await Promise.all([
    recordMagicRequest(db, emailKey, now),
    recordMagicRequest(db, ipKey, now),
  ]);
  const [emailCount, ipCount] = await Promise.all([
    countRecentMagicRequests(db, emailKey, windowStart),
    countRecentMagicRequests(db, ipKey, windowStart),
  ]);
  if (emailCount > RATE_MAX || ipCount > RATE_MAX) {
    await Promise.all([deleteMagicRequestById(db, emailId), deleteMagicRequestById(db, ipId)]);
    return jsonNoStore({ error: 'rate_limited' }, 429);
  }

  const raw = generateToken();
  const tokenHash = await hashToken(raw);
  await storeMagicToken(db, { tokenHash, email, expiresAt: now + MAGIC_TTL_MS });

  const magicUrl = `${magicLinkOrigin(request)}/api/auth/magic/callback?token=${raw}`;
  try {
    await sendMagicLinkEmail({ apiKey: env.BREVO_API_KEY, to: email, magicUrl });
  } catch {
    // Don't leave an unsendable token in D1. (Rate-limit slots are kept on
    // purpose - cheap DoS resistance.) Respond identically to success so the
    // provider error isn't leaked.
    await deleteMagicToken(db, tokenHash);
    return jsonNoStore({ ok: true });
  }

  return jsonNoStore({ ok: true });
};
