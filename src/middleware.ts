/**
 * Astro middleware - applies HTTP security headers and enforces a same-origin
 * CSRF check on state-changing API requests.
 *
 * Auto-discovered by Astro from `src/middleware.ts`. IMPORTANT: under
 * `output: 'static'` this only runs at request time for ON-DEMAND SSR routes
 * (`/[hex]`, `/api/*`, `/og/*`). Pre-rendered pages (the home page and every
 * `/colors/*` page) are emitted as static `.html` and served by the Cloudflare
 * Workers asset layer WITHOUT invoking the worker, so these headers never reach
 * them at runtime - their copy of the same header set is shipped via
 * `public/_headers` (keep the two in sync). The `next()` response is mutated in
 * place, then returned.
 *
 * Header rationale (see audit Tier 1.4 + open decision 3):
 *
 * - `Strict-Transport-Security`: lock TLS for a year, include subdomains.
 *   `preload` is NOT set - the apex isn't in the preload list yet and we
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
 *   broken in production. Cloudflare Web Analytics' auto-injected RUM
 *   beacon is likewise allow-listed on script-src (loader) and
 *   connect-src (cdn-cgi/rum endpoint).
 */
import { defineMiddleware } from 'astro:middleware';
import { isCsrfBlocked } from './lib/auth/csrf';

const GTM = 'https://www.googletagmanager.com';
const GA = 'https://www.google-analytics.com';
const GA_REGIONS = 'https://*.google-analytics.com';
const GA_ALT = 'https://analytics.google.com';
// Cloudflare Web Analytics auto-injects its RUM beacon on Pages when Web
// Analytics is enabled for the project: the loader is served from
// static.cloudflareinsights.com (script-src) and posts measurements to
// cloudflareinsights.com/cdn-cgi/rum (connect-src). Without both the beacon is
// blocked by CSP in production.
const CF_INSIGHTS_SCRIPT = 'https://static.cloudflareinsights.com';
const CF_INSIGHTS_BEACON = 'https://cloudflareinsights.com';
// OAuth profile avatars: Google serves from lh3/lh4/...googleusercontent.com,
// GitHub from avatars.githubusercontent.com. AuthMenu renders <img> from these
// for signed-in users, so img-src must allow them or they're blocked in prod.
const AVATARS = 'https://*.googleusercontent.com https://avatars.githubusercontent.com';

// Per-user API responses must never enter the 30-day edge cache that fronts
// /[hex]. Routes already set `private, no-store`, but force it here too so a new
// endpoint under these prefixes can't leak one user's data by forgetting to.
//
// `/api/palettes` covers the owner CRUD plus `/api/palettes/[id]/vote` and
// `/.../report` - all per-user / mutating, none public-cacheable (the PUBLIC
// palette JSON lives at `/api/p/*.json`, NOT under this prefix). Belt-and-braces
// backstop so the vote endpoint's `private, no-store` can't regress.
//
// Public, cacheable endpoints are deliberately NOT in this list so their own
// Cache-Control survives: `/api/[hex].json`, `/api/p/*.json`, and `/api/explore`
// (anonymous body is public-cacheable; signed-in sets its own no-store).
const PRIVATE_API_PREFIXES = ['/api/me', '/api/presets', '/api/auth/', '/api/palettes'];

const SECURITY_HEADERS: Record<string, string> = {
  // Agent-discovery Link headers (RFC 8288): point machine clients at the API
  // catalog and the markdown site index. KEEP IN SYNC with the `Link:` line in
  // `public/_headers` (which carries these for the statically-served pages the
  // worker never runs on).
  Link: '</.well-known/api-catalog>; rel="api-catalog"; type="application/linkset+json", </llms.txt>; rel="alternate"; type="text/markdown"',
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
    `img-src 'self' data: blob: ${GTM} ${GA} ${AVATARS}`,
    `script-src 'self' 'unsafe-inline' ${GTM} ${CF_INSIGHTS_SCRIPT}`,
    `connect-src 'self' ${GTM} ${GA} ${GA_REGIONS} ${GA_ALT} ${CF_INSIGHTS_BEACON}`,
    `frame-src ${GTM}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    'upgrade-insecure-requests',
  ].join('; '),
};

export const onRequest = defineMiddleware(async (context, next) => {
  // Reject cross-origin state-changing requests BEFORE the handler runs, so a
  // CSRF POST never reaches token-consuming / mutating logic.
  if (isCsrfBlocked(context.request, context.url)) {
    return new Response(JSON.stringify({ error: 'forbidden' }), {
      status: 403,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'private, no-store',
      },
    });
  }

  const response = await next();
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(name, value);
  }
  if (PRIVATE_API_PREFIXES.some((p) => context.url.pathname.startsWith(p))) {
    response.headers.set('Cache-Control', 'private, no-store');
  }
  return response;
});
