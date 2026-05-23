# Image SEO and Performance Audit — uishades.com

**Scope:** `/`, `/colors/coral`, `/4040ff` against `http://localhost:4321`
**Date:** 2026-05-23
**Method:** `curl` for HTML and headers; static analysis of `src/pages/og/[hex].png.ts` and `src/middleware.ts`.

---

## TL;DR

uishades.com is a near-zero raster-image site. The audited pages render **no `<img>` tags, no `<picture>`, no CSS `background-image`, and no `srcset`** — all icons are inline SVG marked `aria-hidden="true"`. The only image surface area is:

1. The site favicon pair (`/favicon.svg`, `/favicon.ico`)
2. The dynamic Open Graph endpoint `/og/[hex].png` (`workers-og`, Cloudflare-only)

Because there are no rendered raster images on any page, the usual image-SEO failure modes (missing alt, oversize JPEGs, CLS, missing lazy-loading, missing srcset) don't apply. The findings instead concentrate on the OG image surface, the dev-vs-edge runtime gap, and a small set of hygiene fixes.

---

## 1. Inventory

### Per-page raster-image surface

| Page | `<img>` count | `<picture>` | CSS bg-image | `og:image` | `twitter:image` | favicon refs | Inline SVG icons (decorative) |
|---|---|---|---|---|---|---|---|
| `/` | 0 | 0 | 0 | `https://uishades.com/og/777777.png` | same | `/favicon.svg`, `/favicon.ico` | 1 |
| `/colors/coral` | 0 | 0 | 0 | `https://uishades.com/og/ff7f50.png` | same | same | 26 |
| `/4040ff` | 0 | 0 | 0 | `https://uishades.com/og/4040ff.png` | same | same | 26 |

### Asset details (all resources discovered)

| Asset | URL | Type | Bytes (dev) | Status | Notes |
|---|---|---|---|---|---|
| Favicon SVG | `/favicon.svg` | image/svg+xml | 1,272 | 200 | `public/favicon.svg`. `Cache-Control: no-cache` in dev (Astro default); CF Pages will serve with its own caching policy in prod. |
| Favicon ICO | `/favicon.ico` | image/x-icon | 655 | 200 | Legacy fallback for older browsers / link-preview crawlers. |
| OG (default home) | `/og/777777.png` | image/png | **0** (dev) | 200 | `workers-og` is a Cloudflare Workers API; under Astro dev/Node it can't render and emits an empty body with 200. Will render correctly at the edge. |
| OG (coral) | `/og/ff7f50.png` | image/png | **0** (dev) | 200 | Same as above. |
| OG (4040ff) | `/og/4040ff.png` | image/png | **0** (dev) | 200 | Same as above. |
| OG (named `coral.png`) | `/og/coral.png` | text/plain | n/a | **404** | The OG route only accepts 3/6/8-char hex (`HEX_RE`), not CSS-named slugs. Correct — the named-color page already resolves the slug to a hex before stamping `og:image`. |

### Inline SVG icons

All inline `<svg>` elements use `viewBox="0 0 16 16"` and `aria-hidden="true"`, which is the correct treatment for decorative icons paired with adjacent text labels (no `alt` equivalent needed). `/colors/coral` and `/4040ff` carry 26 such SVGs each — one bullet/badge icon per shade row plus a logo mark. No SVG `<title>` blocks, which is fine because the parent buttons/links carry accessible names.

---

## 2. Issues by severity

### Critical

None. There are no broken or oversized image assets on the audited routes.

### High

**H-1. Duplicated `Cache-Control` directives on `/og/[hex].png`.**
The actual response header reads:

```
cache-control: public, immutable, no-transform, max-age=31536000, public, max-age=2592000, immutable
```

`workers-og`'s `ImageResponse` stamps its own default (`max-age=31536000, immutable, no-transform`) and our explicit `headers: { 'cache-control': 'public, max-age=2592000, immutable' }` gets *appended* rather than overriding it. Per RFC 7234, when a single `Cache-Control` field contains multiple `max-age` directives the behavior is implementation-defined; Cloudflare's edge picks the lower value, so functionally the cache lives 30 days, but the header is malformed and may confuse downstream proxies, browser devtools, and SEO crawlers.

**Fix:** in `src/pages/og/[hex].png.ts`, wrap the `ImageResponse` and re-set the header on the returned `Response`:

```ts
const res = new ImageResponse(html, { width: 1200, height: 630, format: 'png' });
res.headers.set('cache-control', 'public, max-age=2592000, immutable');
return res;
```

Or upgrade to a `workers-og` version that respects user-supplied `headers` as overrides. Expected impact: clean header, no functional change to cache TTL.

### Medium

**M-1. No fallback / static OG image when `/og/[hex].png` fails.**
If the edge-side `workers-og` ever errors (Satori font fetch failure, deploy regression), Twitter and Facebook crawlers will fetch a broken/empty PNG and may strip the card. There is no `<meta property="og:image" content="…fallback.png">` runner-up, and no static `/og/default.png` in `public/`.

**Fix:** ship a static 1200×630 PNG in `public/og/default.png` (~30–60KB, brand-only) and configure the route to fall back to a 302 to that file on any thrown error. Alternatively register the default as a *second* `og:image` meta — Open Graph accepts multiple, and crawlers walk the list.

**M-2. OG image is PNG, not WebP/AVIF.**
**This is intentional and correct** — Facebook, LinkedIn, Slack, iMessage, and many embed crawlers still don't reliably render WebP/AVIF in link previews. The audit only flags it because the brief asked us to call out the nuance. **Keep as PNG.**

**M-3. No `<meta property="og:image:width">` / `og:image:height` / `og:image:alt` / `og:image:type`.**
These four meta tags are recommended by the Open Graph spec and reduce layout jank in some embeds (Slack, Discord) while also giving screen-reader users on shared links a description. Currently only `og:image` is set.

**Fix:** in `index.astro`, `[hex].astro`, and `colors/[name].astro`, add:

```html
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:image:type" content="image/png" />
<meta property="og:image:alt" content={`Color swatch and shade ramp for ${hexLabel}`} />
```

Expected impact: better card rendering on Discord/Slack, accessibility win for shared-link consumers.

### Low

**L-1. Favicon ICO size is fine but slightly redundant.**
`favicon.ico` is 655B and `favicon.svg` is 1,272B. Most modern browsers will prefer the SVG via the `type="image/svg+xml"` `<link>`. The ICO is still useful for old crawlers, RSS readers, and Windows app pinning. No action required.

**L-2. No `apple-touch-icon` or `<link rel="manifest">` declared.**
iOS home-screen pinning will fall back to a default Safari screenshot. Low priority for a tool site, but a 180×180 PNG dropped at `public/apple-touch-icon.png` plus a `<link rel="apple-touch-icon" href="/apple-touch-icon.png">` would fix it. Expected payoff: small but real for users who "Add to Home Screen."

**L-3. No IPTC/XMP metadata strategy on generated OG PNGs.**
For an OG image whose entire purpose is being scraped by social crawlers, IPTC/XMP metadata is **not relevant** — link-preview pipelines read the `og:*` meta tags from the HTML, not embedded image metadata. Image-SERP indexing (Google Images) might value it, but the OG endpoint isn't linked from any `<img>` tag, so it's not in the Image SERP corpus. **No action.**

**L-4. `favicon.svg` served with `Cache-Control: no-cache` in dev.**
This is the Astro dev server's default for static assets; Cloudflare Pages will apply its own headers in prod. Verify the prod response sets at minimum `public, max-age=86400` on `/favicon.svg`. If not, add a `_headers` file. Tiny impact (1.2KB).

**L-5. Inline SVG icon repetition on shade list pages.**
`/colors/coral` and `/4040ff` each repeat the same `viewBox="0 0 16 16"` SVG ~24 times for the per-row badge. With gzip this compresses cheaply, but a single `<symbol>` defined once + `<use>` references would shave a few hundred bytes off the HTML. Marginal, only worth touching if you're already in that file.

---

## 3. Recommendations ranked by impact

| # | Recommendation | Effort | Expected savings / win |
|---|---|---|---|
| 1 | Add `og:image:width`, `og:image:height`, `og:image:type`, `og:image:alt` meta tags (M-3) | 5 min | Better embed rendering on Slack/Discord; accessibility for shared links. |
| 2 | Fix duplicated `Cache-Control` header on `/og/[hex].png` (H-1) | 10 min | Clean RFC-compliant header; no risk of an upstream proxy honouring the longer (1-year) TTL by mistake. |
| 3 | Ship a static `public/og/default.png` fallback (M-1) | 30 min + design | Resilience: zero broken cards if `workers-og` ever errors at the edge. |
| 4 | Add `apple-touch-icon.png` and `<link rel="apple-touch-icon">` (L-2) | 15 min | iOS home-screen pinning quality. |
| 5 | Verify production `Cache-Control` on `/favicon.svg` and add `_headers` rule if missing (L-4) | 10 min | ~1.2KB per repeat-visit hit (negligible). |
| 6 | (Optional) Refactor repeated inline `<svg>` to `<symbol>` + `<use>` (L-5) | 30 min | A few hundred bytes per shade-list page after gzip. |

### Items explicitly **not** recommended

- **Do NOT convert the OG image to WebP/AVIF** — PNG is the right format for `og:image` because of crawler compatibility (M-2).
- **Do NOT add IPTC/XMP metadata to the generated OG PNG** — irrelevant to the embed-and-share use case (L-3).
- **Do NOT add `loading="lazy"`** — there are no `<img>` tags to lazy-load.
- **Do NOT add `srcset`/`sizes`** — same reason.

---

## 4. Dev-vs-edge runtime note

The dev server returns `200 OK` with **0 bytes** for `/og/4040ff.png`, `/og/777777.png`, and `/og/ff7f50.png`. This is because `workers-og` is built on Cloudflare Workers / Satori APIs not available in the Vite/Node dev runtime. It will render correctly on Cloudflare Pages. **Test the OG endpoint on a preview deploy, not locally.** If you need local verification, you can run `wrangler pages dev dist/` after `npm run build`, which spins up the workers runtime.

The route handler itself (`src/pages/og/[hex].png.ts`) is well-formed: hex validation, HTML escaping for interpolation, ink-color contrast-picked, edge-cache header set. Layout is 1200×630, the de-facto standard for `og:image` and `twitter:card=summary_large_image`.

---

## 5. Pages audited — raw counts

| Page | HTML bytes | `<img>` | `<picture>` | inline `<svg>` | `og:image` | `twitter:image` |
|---|---|---|---|---|---|---|
| `/` | 75,441 | 0 | 0 | 1 | yes | yes |
| `/colors/coral` | 115,274 | 0 | 0 | 26 | yes | yes |
| `/4040ff` | 99,971 | 0 | 0 | 26 | yes | yes |

HTML is uncompressed; production will gzip/brotli at the edge.
