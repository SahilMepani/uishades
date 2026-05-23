# Technical SEO Audit — uishades.com (local dev)

- Environment: `http://localhost:4321/` (Astro v6.3.7 dev server)
- Date: 2026-05-23
- Sampled URLs: `/`, `/colors/coral`, `/4040ff`, `/dev/tool`, `/robots.txt`, `/sitemap-index.xml`, `/sitemap.xml`, `/og/4040ff.png`, `/api/4040ff.json`
- Method: `curl -sS [-I]` against the running dev server, plus source review of `src/middleware.ts`, `astro.config.mjs`, `src/pages/`

> **Dev-vs-prod caveat.** The Astro dev server does not run the `@astrojs/sitemap` integration, so `/sitemap-index.xml`, `/sitemap.xml`, and `/sitemap-0.xml` all return 404 in this audit. The sitemap is generated at `astro build` time. Findings that depend on the sitemap are validated against `astro.config.mjs` source instead.

---

## Per-category status

### 1. Crawlability — **PASS** (with one nit)

| Check | Result |
|---|---|
| `/robots.txt` 200, correct body | PASS — `User-agent: *` / `Allow: /` / `Sitemap: https://uishades.com/sitemap-index.xml` |
| Robots meta on indexable pages | PASS — no `noindex`/`nofollow` on `/`, `/4040ff`, `/colors/coral` |
| Robots meta on `/dev/tool` | PASS — `<meta name="robots" content="noindex,nofollow">` present and verified in raw HTML |
| `X-Robots-Tag` header coverage | INFO — not set anywhere. Fine for HTML (meta tag handles it); could be added to `/api/[hex].json` and `/og/[hex].png` for belt-and-braces |
| Blocked resources (CSS/JS) | PASS — `robots.txt` does not `Disallow` any path; CSS/JS reachable |
| Dev page in production | PASS-by-config — `/dev/tool.astro` returns 404 in `PROD` per CLAUDE.md (returns 200 in dev as expected) |

**Nit:** robots.txt is served with `Cache-Control: no-cache` in dev. Cloudflare Pages will override at the edge, so cosmetic only.

---

### 2. Indexability — **PASS**

| Check | Result |
|---|---|
| Canonical on `/` | PASS — `https://uishades.com/` |
| Canonical on `/4040ff` | PASS — `https://uishades.com/4040ff` (matches the lowercase hex slug) |
| Canonical on `/colors/coral` | PASS — `https://uishades.com/colors/coral` |
| Self-referencing canonicals on absolute URL | PASS |
| `noindex` misuse | PASS — only on `/dev/tool` |
| Duplicate-content risk | LOW — `/4040ff` and `/colors/[name-mapping-to-4040ff]` could collide. `coral` (`#ff7f50`) and `/ff7f50` would both target the same color but have different canonicals, different titles, and different content (the named page has a blurb; the hex page is bare). Acceptable but worth keeping eyes on as the data set grows. |
| `/dev/*` excluded from sitemap | PASS — `astro.config.mjs` line 35 (`filter: (page) => !page.includes('/dev/')`) |
| `getStaticPaths` enumerates all named colors | PASS — 209 entries per CLAUDE.md |

---

### 3. Security headers — **PASS** (CSP carries a flagged known caveat)

All six headers from `src/middleware.ts` are emitted on every sampled response (HTML, JSON, PNG, 404):

| Header | Value | Status |
|---|---|---|
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | PASS — 1-year, no `preload` (intentional per source comment) |
| `X-Content-Type-Options` | `nosniff` | PASS |
| `X-Frame-Options` | `DENY` | PASS — mirrored by `frame-ancestors 'none'` in CSP |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | PASS |
| `Permissions-Policy` | `clipboard-write=(self), accelerometer=(), camera=(), microphone=(), geolocation=(), payment=()` | PASS — `clipboard-write` retained for the copy buttons |
| `Content-Security-Policy` | see below | PASS-with-caveat |

**CSP breakdown** (single-line, verified verbatim against the live response):

```
default-src 'self';
style-src 'self' https://fonts.googleapis.com 'unsafe-inline';
font-src 'self' https://fonts.gstatic.com data:;
img-src 'self' data: blob:;
script-src 'self' 'unsafe-inline';      <-- known caveat
connect-src 'self';
frame-ancestors 'none';
base-uri 'self';
form-action 'self';
object-src 'none';
upgrade-insecure-requests
```

**CSP findings:**

- `'unsafe-inline'` on `script-src` is acknowledged in CLAUDE.md and `middleware.ts`. It's required today for (a) JSON-LD blocks, (b) the home-page inline form-handler, and (c) the inline GTM bootstrap snippet. **Tighten path:** nonces + `strict-dynamic`. Move JSON-LD and the inline GTM/form bootstrap to nonce-attributed scripts; once done, drop `'unsafe-inline'` and add `'strict-dynamic'`.
- `'unsafe-inline'` on `style-src` is acceptable for Tailwind-generated atomic classes and won't cause SEO/security review flags.
- `connect-src 'self'` will block the GTM library from `googletagmanager.com` once it fetches and tries to beacon to `www.google-analytics.com` / `analytics.google.com`. **Verify in browser DevTools after deploy** — there's a real chance GTM is partially broken in prod. If GTM is intentional, add `https://www.googletagmanager.com` to `script-src` and the appropriate `*.google-analytics.com` hosts to `connect-src` and `img-src` (or remove GTM entirely if it isn't carrying its weight on an ad-free tool).
- `upgrade-insecure-requests` is present — good.
- Missing `report-uri` / `report-to`. Optional; low priority.

---

### 4. URL structure — **PASS**

| Check | Result |
|---|---|
| Lowercase | PASS — hex slugs are normalised to lowercase by `parseColor` |
| No tracking params in canonical | PASS |
| Hyphenation | N/A — named colors use single tokens (`coral`, `rebeccapurple`). Multi-word slugs would benefit from hyphens (e.g. `papaya-whip` vs `papayawhip`) but the current set follows the CSS spec, which doesn't hyphenate. Acceptable. |
| Depth | PASS — max depth 2 (`/colors/coral`) |
| Trailing slash | INFO — Astro/Cloudflare typically serves with no trailing slash; the canonical tags match. Make sure the deployed adapter doesn't 301 between `/4040ff` and `/4040ff/`. |
| Hex slug regex | PASS — `[hex].astro` validates strictly per CLAUDE.md |

---

### 5. Mobile — **PASS**

- Viewport meta present on all sampled pages: `<meta name="viewport" content="width=device-width, initial-scale=1">`.
- Tailwind utility classes (e.g. `clamp(2.5rem,8vw,6rem)`) indicate fluid typography on the H1.
- `min-h-svh` used on layout, which is mobile-aware.
- No `maximum-scale=1` or `user-scalable=no` — good.

---

### 6. Core Web Vitals proxies — **WARN**

| Signal | Status | Detail |
|---|---|---|
| Render-blocking CSS | WARN | Google Fonts stylesheet `<link rel="stylesheet" ... media="all">` is render-blocking even with the `rel="preload"` next to it. The `preload` does kick the request earlier, but the `stylesheet` link still blocks render. |
| Render-blocking JS | WARN | Inline GTM snippet is in `<head>` and runs synchronously (the `gtm.js` it injects is `async`, but the bootstrap inlines before paint). Consider deferring GTM until after `load`. |
| `preconnect` | PASS | `fonts.googleapis.com` and `fonts.gstatic.com` (`crossorigin`) |
| `dns-prefetch` | INFO | Not used. Acceptable given the two preconnects already cover the font origins. |
| `font-display` | PASS | Google Fonts URL includes `&display=swap` |
| Lazy-load offscreen images | N/A | The pages emit zero `<img>` tags — colour swatches are CSS-only `div`s. No CLS or lazy-load problem to solve. |
| HTML payload | WARN | Dev-server gzip-less HTML is **~76 KB (home), ~100 KB (/4040ff), ~116 KB (/colors/coral)**. Most of this is Tailwind CSS inlined by Vite in dev mode — production build will extract it into a hashed CSS file, so this should drop significantly. Re-measure against `npm run preview`. |
| Synchronous JS payload | INFO | `client="load"` on `/4040ff` and `/colors/coral` hydrates the ShadeTool eagerly. `client="idle"` on `/` (the small HomeColorPicker island) is good. Consider `client="visible"` on the ShadeTool for the named-colour pages where the user often scrolls the blurb before touching the tool. |
| `loading="lazy"` | N/A | No `<img>` elements. |
| GTM | WARN | Adds a third-party connection (`googletagmanager.com`) and runs on every page including the dev/tool route. If keeping GTM, set `loading="lazy"` equivalent by gating it behind `requestIdleCallback`, and add the host to CSP `script-src`. |

---

### 7. Structured data — **PRESENT** (deep-dive deferred to schema agent)

- `/` ships a `WebApplication` JSON-LD block with `name`, `url`, `description`, `applicationCategory`, `operatingSystem`, `offers`.
- `/colors/coral` ships a `Thing` JSON-LD block with `name`, `description`, `url`, `identifier`, `color`.
- `/4040ff` ships a `Thing` JSON-LD block with `name`, `description`, `url`, `identifier`.
- All blocks are routed through `safeJsonForScript()` per CLAUDE.md.
- No `BreadcrumbList`, `FAQPage`, or `SoftwareApplication` markup observed.

Hand-off to the schema agent for type-fit critique (e.g. `Thing` is generic; could be a more specific subtype).

---

### 8. JavaScript rendering — **WARN** (one finding)

- **Home (`/`)** — Mostly static HTML. Carries a small `HomeColorPicker` island (`client="idle"`). Visible content (H1, "Why uishades.com" section, H3 cards) is in the raw HTML. **NOTE:** CLAUDE.md states the home has "no React island", but the dev response includes an `<astro-island>` for `HomeColorPicker`. Either CLAUDE.md is stale or this is recent. Not an SEO problem (content is in the SSR HTML), but worth reconciling the docs.
- **`/colors/coral`** — H1 (`Coral`) and H2 (`Related colors`) are in static HTML. The ShadeTool island hydrates with `client="load"` but the page is indexable without JS because the blurb, related-colour list, and H1 are server-rendered.
- **`/4040ff`** — *FINDING:* **No `<h1>` in the raw HTML.** The only content the crawler sees server-rendered outside the ShadeTool island is meta/title/JSON-LD plus an empty shell that says "Loading…" (per source). The ShadeTool SSR happens inside the island and Googlebot does render JS — but relying on hydration for the primary H1 weakens the page's static-HTML SEO. Add a server-rendered `<h1>Hex Color #4040FF Tints & Shades</h1>` (or similar) in `[hex].astro` so the H1 exists pre-hydration.
- **`/dev/tool`** — React island hydrates, but the page is `noindex,nofollow` so this is irrelevant for SEO.

---

### 9. IndexNow protocol — **ABSENT**

- No IndexNow wiring detected: zero matches for `indexnow` in `src/`.
- No `indexnow-*.txt` key file in `public/`.
- No POST-on-publish hook in `.github/workflows/deploy.yml` (not inspected here but no source references either way).

**Recommendation:** Worth adding. Bing, Yandex, Seznam, and Naver all accept IndexNow pings. With ~2,340 indexable URLs (209 named + 2,131 popular hexes + home) and presumably more being added, a single ping on deploy buys faster discovery on Bing/Copilot which now feeds many AI search experiences. Implementation is ~30 lines: generate a key, drop `public/<key>.txt`, POST `https://api.indexnow.org/indexnow` with the changed URL list from the deploy workflow.

---

## Issues grouped by severity

### Critical
- *(none)*

### High
- **H1 missing in raw HTML on `/4040ff` (SSR hex pages).** Primary heading depends on the React island hydrating. Move the H1 into the Astro layer of `[hex].astro` so it ships pre-hydration.
- **CSP `connect-src 'self'` will block GTM telemetry.** Either remove GTM, or extend CSP to allow `https://www.googletagmanager.com` (`script-src`) and `*.google-analytics.com` (`connect-src`, `img-src`). Verify in DevTools after deploy.

### Medium
- **`'unsafe-inline'` on `script-src`.** Tighten via nonces + `strict-dynamic` (already tracked in CLAUDE.md / audit Tier 2.4). Lowers attack surface and removes a Lighthouse "Best Practices" deduction.
- **Google Fonts stylesheet is render-blocking.** Self-host the two fonts (Geist, JetBrains Mono) and inline `@font-face` with `font-display: swap`, or move the `<link rel="stylesheet">` to a `media="print" onload="this.media='all'"` pattern.
- **GTM bootstrap runs synchronously in `<head>`.** Defer until `requestIdleCallback` or after `load` to protect LCP/INP.
- **CLAUDE.md says "no React island" on `/`** but the dev response contains a `HomeColorPicker` island. Update the docs or remove the island.
- **Named/hex duplicate-content risk.** `/colors/coral` and `/ff7f50` both describe `#ff7f50`. Today the content differs enough; if hex pages start gaining blurbs, add a `<link rel="alternate">` cross-reference and ensure canonical points to the named page.

### Low
- **No `X-Robots-Tag` on `/api/[hex].json` and `/og/[hex].png`.** Add `X-Robots-Tag: noindex` to both endpoints — they're machine-readable assets that don't belong in search results. The OG endpoint will get linked from social cards which Google may crawl.
- **No IndexNow wiring.** Free win for Bing/Yandex/Naver discovery, especially on each new named-colour or popular-hex addition.
- **No `BreadcrumbList` structured data** on `/colors/[name]`. Trivial to add and improves SERP appearance.
- **Robots.txt served with `Cache-Control: no-cache`** in dev — cosmetic; Cloudflare edge will override.

---

## Top 5 fixes ranked by impact

1. **Add a server-rendered `<h1>` to `[hex].astro`** so `/[hex]` SSR pages have their primary heading in raw HTML, not behind hydration. Highest SEO leverage for the SSR-only ~2,131 popular hex URLs.
2. **Reconcile CSP with GTM** — either drop GTM or extend `script-src`/`connect-src`/`img-src` so it actually fires. Right now telemetry is silently broken (or about to be once the prod CSP applies). Verify in browser before shipping.
3. **Self-host the two web fonts** to drop render-blocking CSS and remove the third-party preconnect chain. Direct LCP improvement.
4. **Defer the inline GTM bootstrap** behind `requestIdleCallback` (or move to a `client:idle`-style pattern). Protects LCP/INP, especially on mobile.
5. **Wire IndexNow into the deploy workflow.** One-time setup; permanently faster Bing/Copilot discovery for every new colour added.

---

## Appendix — sample-URL summary

| URL | Status | Canonical | H1 (raw HTML) | Robots meta | Island |
|---|---|---|---|---|---|
| `/` | 200 | `https://uishades.com/` | yes | (none — indexable) | `HomeColorPicker` @ `client:idle` |
| `/colors/coral` | 200 | `https://uishades.com/colors/coral` | yes (`Coral`) | (none — indexable) | `ShadeTool` @ `client:load` |
| `/4040ff` | 200 (`cache-control: public, s-maxage=2592000, swr=86400`) | `https://uishades.com/4040ff` | **no** | (none — indexable) | `ShadeTool` @ `client:load` |
| `/dev/tool` | 200 in dev (404 in prod per config) | n/a | n/a | `noindex,nofollow` | `ShadeTool` @ `client:load` |
| `/robots.txt` | 200 | n/a | n/a | n/a | n/a |
| `/sitemap-index.xml` | 404 in dev (built at `astro build` time) | n/a | n/a | n/a | n/a |
| `/og/4040ff.png` | 200, `content-type: image/png`, long cache | n/a | n/a | n/a | n/a |
| `/api/4040ff.json` | 200, `content-type: application/json`, `max-age=2592000` | n/a | n/a | n/a | n/a |
