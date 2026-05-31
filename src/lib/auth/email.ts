/**
 * Email delivery, isolated behind a single `fetch` so the provider is a one-file
 * swap. Currently Brevo (free tier: 300/day, ~9k/mo, permanent).
 *
 * The caller passes the API key (read from `env.BREVO_API_KEY` at the route) so
 * this module stays free of any `cloudflare:workers` import and is testable.
 *
 * Note: Cloudflare's `send_email` binding only delivers to verified Email
 * Routing destinations, so it can't send magic links to arbitrary users - an
 * external provider is required.
 */

import { escapeHtml } from './http';

const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';
// Must match the verified Brevo sender / authenticated domain EXACTLY. Brevo's
// API does a case-sensitive match on this string, and the verified sender is
// `login@uishades.com` (lowercase) - capitalizing the domain gets the send
// accepted (2xx) but asynchronously rejected ("sender is not valid").
const DEFAULT_FROM_EMAIL = 'login@uishades.com';
const DEFAULT_FROM_NAME = 'uiShades';

/**
 * POST a payload to Brevo's transactional-email endpoint. Shared by every
 * sender below so the auth key header, content-type, and 4xx/5xx handling live
 * in exactly one place. `sender` defaults to the verified `login@uishades.com`
 * identity (see the case-sensitivity note above) unless a payload overrides it.
 */
async function postToBrevo(apiKey: string, payload: Record<string, unknown>): Promise<void> {
  const res = await fetch(BREVO_ENDPOINT, {
    method: 'POST',
    headers: {
      'api-key': apiKey,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      sender: { name: DEFAULT_FROM_NAME, email: DEFAULT_FROM_EMAIL },
      ...payload,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Brevo send failed (${res.status}): ${detail.slice(0, 300)}`);
  }
}

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

  await postToBrevo(input.apiKey, {
    sender: { name: input.fromName ?? DEFAULT_FROM_NAME, email: input.fromEmail ?? DEFAULT_FROM_EMAIL },
    to: [{ email: input.to }],
    subject,
    htmlContent,
    textContent,
  });
}

export interface SendFeedbackInput {
  apiKey: string;
  /** Site-owner inbox the feedback is delivered to. */
  to: string;
  /** Submitter-supplied display name. */
  name: string;
  /** Submitter's email - used as Reply-To so the owner can just hit reply. */
  fromUserEmail: string;
  /** Submitter's message body. */
  message: string;
}

/**
 * Deliver a visitor's feedback to the site owner. Sent FROM the verified
 * `login@uishades.com` sender (so it passes SPF/DKIM) with the visitor's address
 * as Reply-To. All three user-supplied fields are HTML-escaped before they land
 * in the markup body; the name is also newline-stripped before going into the
 * subject so it can't smuggle extra header-ish content.
 */
export async function sendFeedbackEmail(input: SendFeedbackInput): Promise<void> {
  const subjectName = input.name.replace(/[\r\n]+/g, ' ').trim() || 'a visitor';
  const subject = `uiShades feedback from ${subjectName}`.slice(0, 200);

  const safeName = escapeHtml(input.name);
  const safeEmail = escapeHtml(input.fromUserEmail);
  const safeMessage = escapeHtml(input.message).replace(/\n/g, '<br>');

  const textContent =
    `New feedback from uiShades\n\n` +
    `Name: ${input.name}\n` +
    `Email: ${input.fromUserEmail}\n\n` +
    `${input.message}\n`;
  const htmlContent =
    `<p><strong>New feedback from uiShades</strong></p>` +
    `<p>Name: ${safeName}<br>Email: ${safeEmail}</p>` +
    `<p style="white-space:pre-wrap">${safeMessage}</p>`;

  await postToBrevo(input.apiKey, {
    to: [{ email: input.to }],
    replyTo: { email: input.fromUserEmail, name: subjectName },
    subject,
    htmlContent,
    textContent,
  });
}
