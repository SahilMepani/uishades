/**
 * Astro middleware — applies HTTP security headers to every response.
 *
 * Auto-discovered by Astro from `src/middleware.ts`. Runs on both
 * pre-rendered pages (at request time) and on-demand SSR routes such as
 * `/[hex]`. The `next()` response is mutated in place, then returned.
 *
 * Header rationale (see audit Tier 1.4 + open decision 3):
 *
 * - `Strict-Transport-Security`: lock TLS for a year, include subdomains.
 *   `preload` is NOT set — the apex isn't in the preload list yet and we
 *   don't want to opt-in irrevocably from middleware.
 * - `X-Content-Type-Options: nosniff`: belt-and-braces against browsers
 *   guessing `Content-Type` on our static JSON / PNG endpoints.
 * - `X-Frame-Options: DENY`: stop clickjacking via iframe embed. Mirrored
 *   by `frame-ancestors 'none'` in the CSP for modern browsers.
 * - `Referrer-Policy: strict-origin-when-cross-origin`: leak no path data
 *   to external links (the default in modern browsers, but pin it).
 * - `Permissions-Policy`: deny camera, mic, geolocation, payment, accel.
 *   `clipboard-write=(self)` is required for the copy buttons on the
 *   shade tool to work.
 * - `Content-Security-Policy`: tight default-src 'self' with allowlists
 *   for inline styles, data:/blob: images (canvas exports, OG worker),
 *   and inline scripts. Fonts are self-hosted via Astro's fonts API so
 *   no third-party font/style origins are needed. The `'unsafe-inline'`
 *   on `script-src` is needed for the JSON-LD blocks and the home-page
 *   inline form-handler; audit Tier 2.4 tracks tightening this via
 *   nonces later. GTM and GA4 are allow-listed across script-src
 *   (gtm.js loader), connect-src (collect-endpoint beacons including
 *   regional subdomains like region1.google-analytics.com), and
 *   img-src (legacy pixel beacons). Without these GTM is silently
 *   broken in production.
 */
import { defineMiddleware } from 'astro:middleware';

const GTM = 'https://www.googletagmanager.com';
const GA = 'https://www.google-analytics.com';
const GA_REGIONS = 'https://*.google-analytics.com';
const GA_ALT = 'https://analytics.google.com';

const SECURITY_HEADERS: Record<string, string> = {
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy':
    'clipboard-write=(self), accelerometer=(), camera=(), microphone=(), geolocation=(), payment=()',
  'Content-Security-Policy': [
    "default-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    `img-src 'self' data: blob: ${GTM} ${GA}`,
    `script-src 'self' 'unsafe-inline' ${GTM}`,
    `connect-src 'self' ${GTM} ${GA} ${GA_REGIONS} ${GA_ALT}`,
    `frame-src ${GTM}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    'upgrade-insecure-requests',
  ].join('; '),
};

export const onRequest = defineMiddleware(async (_context, next) => {
  const response = await next();
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(name, value);
  }
  return response;
});
