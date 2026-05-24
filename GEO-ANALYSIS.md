# GEO Analysis — uishades.com

**Date:** 2026-05-24
**Auditor:** `seo-geo` skill (Claude Code)
**URLs audited:** `https://uishades.com/`, `https://uishades.com/colors/coral`, `https://uishades.com/4040ff`
**Supersedes:** the 2026-05-23 report (`3 / 100 — Critical Blocker`). **All three re-audit criteria now pass** — the site returns `server: cloudflare`, robots.txt is no longer `Disallow: /`, and `/` serves the real Astro v6.3.7 build, not the Hostinger parking page. The deployment blocker is resolved; this is a fresh, full audit.

---

## GEO Readiness Score: **67 / 100** — Solid foundation, two real gaps

The fundamentals are good: server-side rendered content, clean schema, a coherent crawler policy, and genuinely citable editorial prose. The score is held back by three things — (1) the **core answer for "shades/tints of X" is rendered client-side** and invisible to AI crawlers, (2) **no `llms.txt`**, and (3) a **zero brand footprint** (the strongest single correlate of AI visibility). None is a blocker; all are fixable.

> **Read this first — the robots.txt is a deliberate "allow AI citation, block AI training" policy, and it's working as intended.** Cloudflare's *Managed robots.txt* (Scrape Shield / AI Audit) is active and blocks AI **training** crawlers — GPTBot (OpenAI training), Google-Extended (Gemini training), ClaudeBot (**Anthropic training**), CCBot, Applebot-Extended, Bytespider, Amazonbot, meta-externalagent — while allowing the **search/retrieval** crawlers that actually produce citations: OAI-SearchBot, ChatGPT-User, PerplexityBot, and (not in the block list, so allowed) Anthropic's Claude-SearchBot and Claude-User, plus traditional search (Googlebot, Bingbot). **Search-citation access is preserved on every major AI platform, including Claude.** The training blocks do not reduce citation surface.

---

## Platform Breakdown

| Platform | Score | Reasoning |
|---|---|---|
| **Google AI Overviews** | 72 / 100 | Googlebot allowed; AIO is served from the **main index**, so the `Google-Extended` block (Gemini training only) does **not** affect it. Content is SSR, schema is clean. Capped because the shade ramp — the literal answer to "shades of X" — isn't in crawlable HTML. |
| **ChatGPT search** | 70 / 100 | `OAI-SearchBot` (search index) and `ChatGPT-User` (live retrieval) are **both allowed**. The `GPTBot` block is **training-only** and does not reduce citation surface. Same client-side-ramp cap. |
| **Perplexity** | 60 / 100 | `PerplexityBot` allowed, content crawlable. Capped harder because Perplexity cites Reddit ~47% of the time and the brand has **zero Reddit presence**. |
| **Bing Copilot** | 66 / 100 | `Bingbot` allowed; supports IndexNow (not yet wired). Standard Bing-index citation path is open. |
| **Claude (web)** | 62 / 100 | The blocked `ClaudeBot` is Anthropic's **training** crawler (the GPTBot analog) — blocking it does **not** affect citations. The bots that drive Claude citations, `Claude-SearchBot` (search index) and `Claude-User` (live retrieval), are **not** in Cloudflare's block list, so they're allowed under `*`. Same client-side-ramp cap as the others. |

---

## AI Crawler Access Status

Live `https://uishades.com/robots.txt` (Cloudflare Managed block prepended to the repo's file):

```
User-agent: *
Content-Signal: search=yes,ai-train=no
Allow: /

User-agent: Amazonbot              Disallow: /
User-agent: Applebot-Extended      Disallow: /
User-agent: Bytespider             Disallow: /
User-agent: CCBot                  Disallow: /
User-agent: ClaudeBot              Disallow: /
User-agent: CloudflareBrowserRenderingCrawler  Disallow: /
User-agent: Google-Extended        Disallow: /
User-agent: GPTBot                 Disallow: /
User-agent: meta-externalagent     Disallow: /

User-agent: *                      Allow: /
Sitemap: https://uishades.com/sitemap-index.xml
```

| Crawler | Role | Status | GEO impact |
|---|---|---|---|
| Googlebot | Search index (powers AI Overviews) | ✅ Allowed | None — AIO access intact |
| OAI-SearchBot | ChatGPT **search** index | ✅ Allowed | None — ChatGPT citation intact |
| ChatGPT-User | ChatGPT **live retrieval** | ✅ Allowed | None |
| PerplexityBot | Perplexity index | ✅ Allowed | None |
| Bingbot | Bing index (powers Copilot) | ✅ Allowed | None |
| Claude-SearchBot | Claude **search** index | ✅ Allowed | None — Claude citation intact |
| Claude-User | Claude **live retrieval** | ✅ Allowed | None |
| GPTBot | OpenAI **training** | ⛔ Blocked | Low — training only, not citation |
| Google-Extended | Gemini **training/grounding** | ⛔ Blocked | Low — does not affect AIO |
| CCBot | Common Crawl (training) | ⛔ Blocked | Low |
| ClaudeBot | Anthropic **training** | ⛔ Blocked | Low — training only; `Claude-SearchBot`/`Claude-User` (citation) are allowed |

**Where this block actually lives — important.** It is **two** Cloudflare-edge features, both under **dashboard → zone Overview → Control AI crawlers**, and neither is in the repo:

1. **Block AI training bots** = `Block on all pages` — an *active* managed WAF rule that returns 403 to bots categorized as AI **training** crawlers (GPTBot, ClaudeBot, Google-Extended, CCBot, …). Enforced, not advisory. Options are all-or-nothing: *Block on all pages / Block only on hostnames with ads / Do not block*.
2. **Manage your robots.txt** = `Instruct AI bot traffic with robots.txt` — generates the advisory `Disallow` directives shown above.

The repo's `public/robots.txt` (allow-all + sitemap) is **not** what's served; editing and pushing it will not change the policy. **There is no per-bot toggle** in either control — it's the whole AI-training category or nothing.

**No change needed for citations.** `Content-Signal: ai-train=no` plus the enforced training-crawler block is a coherent "let AI cite me, don't train on me" stance. ClaudeBot is Anthropic's **training** crawler (the GPTBot analog); the bots that produce Claude citations — `Claude-SearchBot` and `Claude-User` — are categorized as AI *search*, not training, so they are **not** blocked and Claude can already cite the site. The only reason to flip "Block AI training bots" to *Do not block* is if you affirmatively *want* AI models (all of them — GPTBot, ClaudeBot, Google-Extended) to train on your content.

---

## llms.txt Status

| File | HTTP | Result |
|---|---|---|
| `/llms.txt` | **404** | Absent (clean 404 — no longer the parking-page HTML). |
| `/llms-full.txt` | 404 | Absent. |

Recommend adding `public/llms.txt`. A copy-paste template is in the appendix. This is a low-effort, medium-impact win: AI crawlers increasingly probe for it, and it lets you steer them to the canonical color pages and state the ramp algorithm in plain text (which compensates for the JS-gated ramp — see citability).

---

## Server-Side Rendering Check

AI crawlers do **not** execute JavaScript. What's in the initial HTML is what gets cited.

| Content | In server HTML? | Citable? |
|---|---|---|
| Home "Why" sections (Free / Better algorithm / Tailwind-first) | ✅ Yes | ✅ |
| Color-page editorial blurb (the "Notes" prose) | ✅ Yes | ✅ |
| OKLCH L/C/H values, family, aliases (`<dl>`) | ✅ Yes | ✅ |
| Complementary / triadic / analogous **palette plate** (5 swatches + hexes) | ✅ Yes | ✅ |
| JSON-LD (Organization, WebSite, SoftwareApplication, BreadcrumbList, CreativeWork) | ✅ Yes | ✅ |
| **The 20-shade OKLCH ramp** (the actual tints/shades + their hex values) | ❌ No — inside `<ShadeTool client:load>` | ❌ |
| **The 11-stop Tailwind scale** (50…950 values) | ❌ No — React island | ❌ |

**This is the single biggest GEO gap.** A page titled "Coral (#FF7F50) Color Shades, Tints & Palette" answers *"what is coral"* well, but an AI crawler reading the HTML **cannot extract the actual shade/tint hex values** — they're computed in the client island. For the headline query class ("shades of coral", "tints of #ff7f50"), the literal answer is invisible to the crawler. The 5-color harmony palette *is* server-rendered (good), but the 20-step ramp and Tailwind scale — the product's whole point — are not.

---

## Passage-Level Citability

The editorial blurbs are a genuine strength — definition-first, self-contained, specific. The live `/colors/coral` "Notes" passage:

> *"Coral is the warm pink-orange named after the living reef organism. The CSS value is brighter than what most coral actually looks like underwater but matches the popular interior-design tone that took off in the 2000s and again in 2019 as Pantone's color of the year. Designers reach for it for energetic accent buttons, calls to action, and editorial palettes that want warmth without aggression. Against white the contrast is borderline for body text and reliable for headlines…"*

- ✅ Opens with the `X is…` definition pattern — ideal for AI extraction.
- ✅ Self-contained, specific facts (Pantone 2019, contrast guidance), no fluff.
- ⚠️ ~105 words — **just under the 134–167-word optimal citation band.** Extending each blurb by 2–3 sentences (usage, pairing hexes, accessibility note) lands it in the sweet spot.
- ⚠️ The factual data points (OKLCH values, contrast ratios, the shade hexes) live in the `<dl>` and the JS tool — they're not woven into the prose where they'd be most quotable.

---

## Schema Readiness

| Page | Schemas emitted | Assessment |
|---|---|---|
| `/` | Organization, WebSite (+SearchAction), SoftwareApplication | Strong entity + tool recognition. |
| `/colors/[name]` | BreadcrumbList, CreativeWork (keywords, alternateName/aliases, `about.Thing`) | Good factual graph. |
| `/[hex]` | BreadcrumbList, CreativeWork (generic) | Adequate. |

All JSON-LD correctly routed through `safeJsonForScript()`. Gaps that would lift AI citation:

1. **No `FAQPage`** — the highest-leverage add. AI engines re-emit Q&A directly.
2. **No `HowTo`** — for "how to generate a Tailwind scale from a hex" / "how to build an OKLCH ramp."
3. **No `dateModified` / `datePublished`** on any page — AI engines favor dated, fresh content.
4. **No author/`Person` or `sameAs`** entity links — nothing ties the brand to an external graph (GitHub, etc.).
5. `CreativeWork` is generic; the color pages could carry richer machine-readable color data (e.g. a `PropertyValue` set for OKLCH/RGB/contrast).

---

## Brand Mention Analysis

Brand mentions correlate ~3× more strongly with AI visibility than backlinks — this is the weakest dimension.

| Surface | Presence | Note |
|---|---|---|
| Google search ("uishades.com OKLCH shade generator") | ❌ Not surfaced | Domain is ~1 day live; not yet indexed/ranked. |
| Reddit | ❌ None | Directly caps Perplexity (cites Reddit ~47%). |
| YouTube | ❌ None | YouTube mentions are the strongest single AI-citation correlate (~0.74). |
| Wikipedia / Wikidata | ❌ None | Expected for a new tool; don't self-create. |
| Competitive field | Crowded | oklch.com, oklch.fyi, atmos.style, ColorGraffle, uico, and a same-named `ui-shades-generator` on GitHub Pages already occupy the space. |

This is normal for a day-old domain, but it's the ceiling on AI visibility until addressed. The differentiators worth seeding into communities: the **Classic mode that reproduces 0to255's RGB-walk bit-for-bit**, and the **OKLCH bell-curve chroma** that keeps yellows/olives from muddying — both are concrete, novel, and discussion-worthy.

---

## Top 5 Highest-Impact Changes

| # | Change | Effort | Impact | Why |
|---|---|---|---|---|
| 1 | **Server-render the shade values.** Emit the 20-step OKLCH ramp and 11-stop Tailwind scale (hex + label) as a `<noscript>`-safe `<table>`/`<dl>` in the page HTML, even if the interactive island re-renders them. | Med | **Very High** | Makes the literal answer to "shades/tints of X" crawlable. Directly unblocks the core query class for every AI platform. |
| 2 | **Add a `www`→apex 301.** Both `uishades.com` and `www.uishades.com` are Cloudflare Worker routes to the same deployment and both return `200` with no redirect (duplicate host). Add a 301 `www`→apex (the code's canonical host). | Low | Med | Consolidates host signals and keeps `www` URLs out of the index. Canonicals already point at the apex, so Google mostly handles it — the 301 is the clean belt-and-braces. |
| 3 | **Add `public/llms.txt`** + the algorithm description (template below). | Low | High | Low-cost discoverability; plain-text fallback for the JS-gated ramp facts. |
| 4 | **Add `FAQPage` schema** to `/colors/[name]` (3–5 Q&A from existing blurb: "What is coral?", "What hex codes pair with coral?", "Is coral accessible on white?"). | Med | High | Direct citability lift for the definition/usage queries AI engines re-emit. |
| 5 | **Extend blurbs to 140–165 words** and weave in the actual key shade hexes + a contrast number. | Med | Med | Lands passages in the optimal citation band and embeds the quotable facts in prose. |

---

## Content Reformatting Suggestions

- **First 60 words = the definition.** The coral blurb already nails this. Audit the other 208 blurbs to ensure each opens with `"<Name> is a <family> color (<hex>)…"`.
- **Add a question-based H2 per color page**, e.g. `<h2>What are the shades and tints of Coral?</h2>` directly above the (newly server-rendered) ramp table. Question headings match AI query patterns.
- **Put the harmony palette and ramp into real tables/lists with text**, not just CSS-background swatches. A `<table>` of `shade name | hex | contrast vs white` is maximally extractable.
- **Add `dateModified` to JSON-LD** and a visible "Updated 2026" line in the colophon.
- **One canonical home-page FAQ block** ("What is an OKLCH ramp?", "OKLCH vs HSL for shades?", "How is this different from 0to255?") — these are exactly the comparison queries AI engines answer.

---

## Minor / Technical Findings

- **Canonical ↔ trailing-slash mismatch — RESOLVED in code (pending deploy).** Set `trailingSlash: 'never'` + `build: { format: 'file' }` in `astro.config.mjs`. Now `/colors/coral` serves `200` and `/colors/coral/` + `/4040ff/` `301`→ the bare URL, matching every page's no-slash `<link rel="canonical">`. Verified locally: file-format build output, sitemap emits no-slash named URLs, preview redirects confirmed, 68 unit + 3 a11y E2E tests pass. **Purge the Cloudflare cache after deploy** so the old `307`s age out.
- **Host canonicalization — add a `www`→apex 301.** DNS (verified) shows both `uishades.com` and `www.uishades.com` as Cloudflare Worker routes to the same `uishades` deployment — no Hostinger record. Both serve `200` with no redirect, so the site is reachable on two hosts. Since the codebase canonicalizes to the **apex**, add a 301 `www`→apex (Cloudflare Rules → Redirect Rules, or in `src/middleware.ts`). Canonical tags already point at the apex, so this is cleanup, not urgent. *(An earlier `server: hcdn` reading on the apex during this audit was a stale local-DNS-cache artifact on the auditing machine — not a production issue; forcing the apex to Cloudflare's authoritative edge returns the real site.)*
- **Security headers are solid** (HSTS, CSP, X-Content-Type-Options, X-Frame-Options: DENY, Referrer-Policy, Permissions-Policy) — no GEO penalty, noted as healthy.
- **IndexNow not wired** — cheap Bing/Copilot freshness signal if added to the deploy step.

---

## Appendix: `public/llms.txt` template

```
# uishades.com

> Free, ad-free generator for tints and shades of any color. Convert any hex,
> rgb(), hsl(), oklch(), or CSS color name into a 20-step OKLCH perceptual ramp
> or an 11-stop Tailwind scale (50…950), with copy-ready exports. Mirrors
> 0to255.com's URL structure: /[hex] and /colors/[name] permanent links.

## Core pages
- [Home](https://uishades.com/): Generate tints and shades from any color.
- [Named colors](https://uishades.com/colors/coral): 209 CSS named colors, each with an OKLCH ramp, aliases, harmony palette, and contrast badges.
- [Hex URLs](https://uishades.com/4040ff): Permanent /[hex] page for any 3/6/8-digit hex.

## How the ramps work
- OKLCH mode: 20-shade perceptual ramp at evenly spaced lightness (L≈0.95 down to L≈0.06). The input hex is pinned to its nearest lightness step. Chroma uses a bell-curve multiplier (1.0 mid-lightness, 0.3 at the extremes) to stay inside the sRGB gamut and avoid washed-out clipping near white/black.
- Classic mode: a reverse-engineered RGB-walk that reproduces the pre-paywall 0to255.com output bit-for-bit (+17 per channel lighter; two-phase residual-carry darker).
- Tailwind scale: 11 stops (50…950); the input snaps to its nearest stop.

## Exports
- Tailwind v4 @theme, Tailwind v3 config, CSS custom properties, W3C Design Tokens (DTCG) JSON, Figma Variables.

## Notes
- Free, no ads, no signup. WCAG contrast badge on every shade.
- JSON API: https://uishades.com/api/[hex].json
```

---

## Re-audit triggers

Re-run `/seo-geo` after: (1) the shade ramp is server-rendered, (2) `llms.txt` ships, (3) the site has ~30 days of indexed content and any community/Reddit/YouTube mentions to measure brand signal against.
