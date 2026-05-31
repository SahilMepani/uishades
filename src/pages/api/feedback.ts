/**
 * POST /api/feedback { name, email, message } - relay a visitor's feedback to
 * the site owner's inbox via Brevo.
 *
 * Anonymous (no session required). Rate-limited per-IP (5/hour) so nobody can
 * burn the Brevo quota or flood the owner's inbox - reuses the generic
 * `magic_link_requests` key/timestamp counter with a `fb-ip:` key namespace, so
 * no new table is needed. CSRF is enforced upstream in `middleware.ts` (this
 * path is listed in `CSRF_PROTECTED_PREFIXES`). Unlike the magic-link route we
 * surface a real error on send failure, so the visitor knows their message
 * didn't go through.
 */
export const prerender = false;

import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import {
  countRecentMagicRequests,
  pruneMagicRequests,
  recordMagicRequest,
} from '../../lib/auth/db';
import { sendFeedbackEmail } from '../../lib/auth/email';
import { jsonNoStore } from '../../lib/auth/http';
import { normalizeEmail } from '../../lib/auth/normalize';

const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const RATE_MAX = 5;
// Same shape as the magic-link route's check: reject HTML-dangerous chars in
// addition to whitespace/@ as defense-in-depth (the address is escaped again at
// render time in the email body).
const EMAIL_RE = /^[^\s@<>"'`]+@[^\s@<>"'`]+\.[^\s@<>"'`]+$/;
const NAME_MAX = 100;
const MESSAGE_MAX = 5000;

export const POST: APIRoute = async ({ request }) => {
  let name = '';
  let email = '';
  let message = '';
  try {
    const data = (await request.json()) as {
      name?: unknown;
      email?: unknown;
      message?: unknown;
    };
    name = String(data?.name ?? '').trim();
    email = normalizeEmail(String(data?.email ?? ''));
    message = String(data?.message ?? '').trim();
  } catch {
    return jsonNoStore({ error: 'bad_request' }, 400);
  }

  if (!name || name.length > NAME_MAX) {
    return jsonNoStore({ error: 'invalid_name' }, 400);
  }
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return jsonNoStore({ error: 'invalid_email' }, 400);
  }
  if (!message || message.length > MESSAGE_MAX) {
    return jsonNoStore({ error: 'invalid_message' }, 400);
  }

  // Recipient comes only from the Worker secret - never hardcoded in source. If
  // it's unset the form can't deliver, so fail loudly rather than silently drop.
  const recipient = env.FEEDBACK_RECIPIENT_EMAIL;
  if (!recipient) {
    return jsonNoStore({ error: 'send_failed' }, 502);
  }

  const db = env.DB;
  const now = Date.now();
  const windowStart = now - RATE_WINDOW_MS;
  await pruneMagicRequests(db, windowStart);

  const ip = request.headers.get('CF-Connecting-IP') ?? 'local';
  const ipKey = `fb-ip:${ip}`;
  const count = await countRecentMagicRequests(db, ipKey, windowStart);
  if (count >= RATE_MAX) {
    return jsonNoStore({ error: 'rate_limited' }, 429);
  }

  try {
    await sendFeedbackEmail({
      apiKey: env.BREVO_API_KEY,
      to: recipient,
      name,
      fromUserEmail: email,
      message,
    });
  } catch {
    // Provider failure - tell the visitor so they can retry (no rate-limit slot
    // is consumed, so a transient Brevo hiccup doesn't lock them out).
    return jsonNoStore({ error: 'send_failed' }, 502);
  }

  await recordMagicRequest(db, ipKey, now);
  return jsonNoStore({ ok: true });
};
