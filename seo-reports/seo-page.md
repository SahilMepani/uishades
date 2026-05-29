# SEO Audit — UIshades.com Home Page

**Target:** http://localhost:4321/ (dev server)
**Date:** 2026-05-23
**Sampled:** `/`, `/colors/coral`, `/4040ff`

---

## Score Card

| Category               | Score   | Notes |
|------------------------|---------|-------|
| On-Page SEO            | 76/100  | Strong title/meta. H1 on home is good, but H1 ambiguous to crawlers (the brand name "UIshades.com" only appears in eyebrow text); single internal nav link is anemic. |
| Content Quality        | 58/100  | Only 143 visible words on home — thin for a landing page targeting "tints and shades" SERPs. |
| Technical              | 80/100  | Canonical present, OG/Twitter complete, JSON-LD present. Missing meta robots (default OK), missing hreflang (single-locale OK), no `noindex` leakage. |
| Images                 | 95/100  | Home page has zero `<img>` tags — nothing to flag. (OG image referenced but not embedded.) |
| Core Web Vitals proxies| 70/100  | Google Fonts is a blocking external request and ships ~5 weights × 2 families. GTM loads on every page. Inline CSS bloats HTML to 75 KB. No render-blocking JS, no large hero. |
| **Overall**            | **76/100** | |

---

## Page Snapshot — `/`

- **Title** (62 chars): `UIshades.com — Free Tints and Shades of Any Hex Color` — good length, primary kw present.
- **Description** (152 chars): `Find tints and shades of any hex color, free. OKLCH ramps, Tailwind 11-stop scales, exports you can paste straight into your code.` — well crafted, length ideal.
- **Canonical:** `https://UIshades.com/` (correct, absolute).
- **H1** (single): `Tints & shades of any color.` — keyword-aligned but does not contain the brand name.
- **H2:** `Why UIshades.com` (sr-only — fine for a11y but Google does honor visually-hidden headings).
- **H3** ×3: `Free, forever.`, `Better algorithm.`, `Tailwind-first exports.`
- **Heading order:** H1 → H2 → H3, no skips. Clean.
- **Word count (visible):** 143 words.
- **Internal links:** 2 (`/`, `/colors/coral`). External: `astro.build`, `culorijs.org`.
- **OG/Twitter:** Both complete — `og:type=website`, `og:image=https://UIshades.com/og/777777.png`, twitter `summary_large_image`.
- **JSON-LD:** `WebApplication` schema, name/url/description/offers (price 0). (Schema validation deferred to schema agent.)
- **Hreflang:** None present. Acceptable for English-only site, but if international rollout is planned, add `<link rel="alternate" hreflang="x-default">` at minimum.
- **Meta robots:** Not set. Default `index,follow` applies — fine.
- **Lang attr:** `<html lang="en">` — correct.
- **Images:** Zero `<img>` tags on the page. Single inline `<svg>` (color-picker icon) is `aria-hidden`. No CLS or alt-text exposure.
- **Render-blocking resources:** External Google Fonts stylesheet (`fonts.googleapis.com/css2?...`) is render-blocking even with the preload+preconnect chain. `display=swap` mitigates FCP but the stylesheet still blocks the CSSOM step.
- **Inline JS:** ~10 KB inline script for the form handler with the 138-entry baked named-color JSON. Acceptable trade-off — no React boot on `/`.
- **GTM:** Loads `googletagmanager.com/gtm.js` async + a noscript iframe fallback. Async, so not blocking, but is the largest non-essential request on the page.

---

## Other Routes (Sampled)

### `/colors/coral` (prerendered)
- Title: `Coral (#FF7F50) Color Shades, Tints & Palette | UIshades.com` — 60 chars, ideal.
- Description: `Coral is the warm pink-orange named after the living reef organism...` — engaging, but ends in `…but` (truncated mid-sentence). **Fix:** finish the sentence or trim cleanly.
- H1 ×1, H2 ×2 (`palette-title`, `related-title`). Good structure.
- Word count: 279 — much healthier than home.
- OG `og:type=article` — correct for content pages.

### `/4040ff` (SSR)
- Title: `Hex Color #4040FF Tints & Shades | UIshades.com` — 50 chars, good.
- Description: `Tints and shades of #4040FF. OKLCH ramp, 11-stop Tailwind scale, copy-ready exports.` — 86 chars, slightly short but fine.
- **H1: missing in SSR HTML.** The page renders only the React island shell server-side; the heading is injected post-hydration. Googlebot renders JS so it'll eventually see it, but it adds a render-tier-2 dependency for the highest-fan-out URL family on the site.
- Word count: 138 (but most of that is hex values like `#4040ff`, `Click to copy`).
- `Cache-Control: public, s-maxage=2592000, stale-while-revalidate=86400` — excellent edge caching.

---

## Issues Found

### Critical
- **`/[hex]` SSR HTML has no `<h1>` and no semantic heading.**
  *Fix:* In `src/pages/[hex].astro`, emit a static `<h1>Hex Color {hexLabel} Tints & Shades</h1>` (or include the named-color name when matched) inside `<main>` above `<ShadeTool>`. Hidden visually if it duplicates the React heading, but present in initial HTML.

### High
- **Home page is content-thin (143 visible words) for the target query `tints and shades`.**
  *Fix:* Add a short "How it works" or "What's the difference between a tint and a shade?" passage (~150 words) below the why-cards to lift on-topic body content and improve dwell signals.
- **Only one internal navigation link on `/` (`/colors/coral`).**
  *Fix:* Add a "Popular hexes" or "Browse named colors" strip — even 6–10 anchors (`/colors/black`, `/colors/white`, `/000000`, `/ff0000`, …) — to give crawlers depth signals and let users branch from the landing page.
- **`/colors/coral` description ends mid-sentence (`...but...`).**
  *Fix:* Audit the blurb-truncation logic in `named-colors.ts`; ensure descriptions either complete the clause or terminate on punctuation, not mid-word "but".
- **Google Fonts stylesheet is render-blocking on every route.**
  *Fix:* Self-host the two families and inline the `@font-face` rules with `font-display: swap`, OR drop to a single weight per family (currently 5+3 weights are loaded). Saves ~150–250 ms on cold loads.

### Medium
- **H1 on `/` does not contain the brand name `UIshades.com`.** The eyebrow `<p>UISHADES.COM — free, fast, OKLCH</p>` carries the brand but `<p>` is weak signal.
  *Fix:* Either move the brand into the H1 (`Tints & shades of any color · UIshades.com`) or wrap the eyebrow in a semantic element (it's editorial chrome, so this is a judgment call — current state is acceptable).
- **`H2` on `/` is `sr-only`.** Google generally indexes it, but a visible section heading would be stronger.
  *Fix:* Optional — promote the sr-only H2 `Why UIshades.com` to a visible heading above the 3-up grid, or add a visible H2 like `Tints, shades, and design-ready exports`.
- **GTM loads synchronously in `<head>` before `</head>`.** It's set to `async` inside the snippet, but the `<script>` block itself executes during head parse.
  *Fix:* Move GTM injection to just before `</body>`, or behind a consent gate, to avoid main-thread contention during the critical render path.
- **Inline `<style>` blocks ship ~70 KB of Tailwind CSS in each route's HTML during dev.** Production build will inline only critical CSS via Astro's pipeline — verify the production HTML is smaller. (Not a fix, just confirm.)

### Low
- **No `meta robots` tag** on `/`. Default is fine; consider adding `<meta name="robots" content="max-image-preview:large">` to opt into large image previews in SERPs.
- **No `lastmod` on home in sitemap** (sitemap is auto-generated). Consider injecting freshness signals if the home page copy changes.
- **External links** to `astro.build` and `culorijs.org` use `rel="noopener"` but not `rel="nofollow"` or `rel="ugc"`. These are editorial endorsements, so current state is appropriate — flagging only because some auditors will note it.
- **`Generator: Astro v6.3.7` meta** leaks the framework version. Not a security risk (the framework is open source) but trivial to remove if you want to reduce fingerprinting surface.
- **Twitter card `summary_large_image`** with a 1200×630 PNG — confirm the OG image exists at `https://UIshades.com/og/777777.png`. (Cannot verify in dev; sample to make sure the `/og/[hex].png` endpoint returns 200 for `777777`.)

---

## Top 3 Recommendations (by expected impact)

1. **Add a static `<h1>` to `/[hex]` SSR output.** *Impact: HIGH.* This is the highest-fan-out route on the site (one URL per hex). Without a server-rendered H1, the page leans entirely on Googlebot's JS rendering tier, which is delayed and rate-limited. A one-line edit in `[hex].astro` (above `<ShadeTool>`) closes the gap and gets every hex URL indexed faster. Best ROI on the audit.

2. **Lift home page content from 143 → ~300 words and add internal-link depth.** *Impact: MEDIUM-HIGH.* Add a "What's a tint vs a shade?" paragraph plus a "Browse popular colors" strip with 8–12 internal links (`/colors/coral`, `/colors/teal`, `/000000`, `/ff0000`, etc.). Lifts topical relevance for the head term and feeds crawl depth into the long tail. Pair with the existing `popular-hexes.ts` data — it's already loaded for the sitemap.

3. **Self-host fonts (or drop to 1–2 weights) and defer GTM.** *Impact: MEDIUM (CWV).* Google Fonts is the only render-blocking external dependency on the page; collapsing the request and trimming weights cuts LCP/FCP by 100–250 ms on cold visits. Deferring GTM to body-end (or behind consent) frees the main thread during the critical render window. These together should noticeably improve the field LCP/INP scores Lighthouse CI is tracking.

---

## Notes for Adjacent Audits
- Schema deep-dive deferred. JSON-LD types present: `WebApplication` (`/`), `Thing` (`/[hex]`), and on `/colors/[name]` (not validated here but should be `Article` or `CreativeWork`).
- Performance/Lighthouse CI is already wired (`npm run lhci`); this audit is HTML-tier only.
- Mobile UX not assessed here — Playwright `mobile-chrome` project covers it.
