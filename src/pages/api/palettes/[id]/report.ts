/**
 * POST /api/palettes/[id]/report - report a public palette for moderation.
 *
 * Anonymous (no session required - a logged-out visitor browsing /explore must
 * be able to report). Rate-limited per IP (5/hour) reusing the generic
 * `magic_link_requests` key/timestamp counter with a `report-ip:` namespace - no
 * new table - exactly like the feedback route's `fb-ip:` pattern.
 *
 * Tally + threshold: each accepted report records a `report:<id>` row in the
 * same counter table; once REPORT_THRESHOLD distinct reports accumulate the
 * palette is `flagged=1` and drops out of `/explore` and the
 * sitemap (it stays reachable by direct slug but `noindex`'d - see the plan's
 * moderation section). A solo-founder manual review (`SELECT … WHERE flagged=1`)
 * is the human backstop.
 *
 * To avoid enumeration, the response is ALWAYS `{ ok: true }` (200) regardless of
 * whether the id exists, is already flagged, or just got flagged - a probe can't
 * distinguish a real palette from a miss. CSRF is enforced upstream in
 * `middleware.ts`. Cache-Control is `private, no-store` (it's a mutation).
 */
export const prerender = false;

import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import {
  countRecentMagicRequests,
  flagPalette,
  getPaletteWithColors,
  pruneMagicRequests,
  recordMagicRequest,
} from '../../../../lib/auth/db';
import { jsonNoStore } from '../../../../lib/auth/http';

const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const RATE_MAX = 5; // reports per IP per hour
// Reports are de-duplicated only by the rate limit (not by reporter identity, as
// reporting is anonymous), so the threshold is kept low but >1 so a single
// actor's burst (capped at RATE_MAX/hour) still needs sustained or multi-IP
// pressure to hide a palette. Manual review catches the rest.
const REPORT_THRESHOLD = 3;
// Reports never expire from the tally - count across all time for this palette.
const TALLY_SINCE = 0;

export const POST: APIRoute = async ({ params, request }) => {
  const id = params.id ?? '';
  const db = env.DB;
  const now = Date.now();
  const windowStart = now - RATE_WINDOW_MS;
  await pruneMagicRequests(db, windowStart);

  // Per-IP rate limit. We still return ok:true on a limit hit (no enumeration
  // and no feedback to an abuser about whether they're being throttled).
  const ip = request.headers.get('CF-Connecting-IP') ?? 'local';
  const ipKey = `report-ip:${ip}`;
  const ipCount = await countRecentMagicRequests(db, ipKey, windowStart);
  if (ipCount >= RATE_MAX) {
    return jsonNoStore({ ok: true });
  }

  // Only tally/flag a real, not-already-flagged palette - but the response shape
  // is identical for a miss, so the caller learns nothing about existence.
  const palette = id ? await getPaletteWithColors(db, id) : null;
  if (palette && !palette.flagged) {
    await recordMagicRequest(db, ipKey, now);
    const tallyKey = `report:${id}`;
    await recordMagicRequest(db, tallyKey, now);
    const reports = await countRecentMagicRequests(db, tallyKey, TALLY_SINCE);
    if (reports >= REPORT_THRESHOLD) {
      await flagPalette(db, id);
    }
  }

  return jsonNoStore({ ok: true });
};
