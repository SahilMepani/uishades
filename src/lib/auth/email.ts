/**
 * Email delivery, isolated behind a single `fetch` so the provider is a one-file
 * swap. Currently Brevo (free tier: 300/day, ~9k/mo, permanent).
 *
 * The caller passes the API key (read from `env.BREVO_API_KEY` at the route) so
 * this module stays free of any `cloudflare:workers` import and is testable.
 *
 * Note: Cloudflare's `send_email` binding only delivers to verified Email
 * Routing destinations, so it can't send magic links to arbitrary users — an
 * external provider is required.
 */

import { escapeHtml } from './http';

const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';
const DEFAULT_FROM_EMAIL = 'login@UIshades.com';
const DEFAULT_FROM_NAME = 'uiShades';

export interface SendMagicLinkInput {
  apiKey: string;
  to: string;
  magicUrl: string;
  fromEmail?: string;
  fromName?: string;
}

export async function sendMagicLinkEmail(input: SendMagicLinkInput): Promise<void> {
  const subject = 'Your uiShades sign-in link';
  const textContent =
    `Sign in to uiShades by opening this link (valid for 15 minutes):\n\n${input.magicUrl}\n\n` +
    `If you didn't request this, you can ignore this email.`;
  const safeUrl = escapeHtml(input.magicUrl);
  const htmlContent =
    `<p>Sign in to uiShades by clicking the button below (valid for 15 minutes):</p>` +
    `<p><a href="${safeUrl}" style="display:inline-block;padding:10px 18px;` +
    `background:#4040ff;color:#fff;border-radius:8px;text-decoration:none">Sign in</a></p>` +
    `<p style="color:#666;font-size:13px">If you didn't request this, you can ignore this email.</p>`;

  const res = await fetch(BREVO_ENDPOINT, {
    method: 'POST',
    headers: {
      'api-key': input.apiKey,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      sender: { name: input.fromName ?? DEFAULT_FROM_NAME, email: input.fromEmail ?? DEFAULT_FROM_EMAIL },
      to: [{ email: input.to }],
      subject,
      htmlContent,
      textContent,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Brevo send failed (${res.status}): ${detail.slice(0, 300)}`);
  }
}
