# GEO Analysis — uishades.com

**Date:** 2026-05-23
**Auditor:** `seo-geo` skill (Claude Code)
**URLs audited:** `https://uishades.com/`, `https://uishades.com/colors/coral`, `https://uishades.com/4040ff`

---

## GEO Readiness Score: **3 / 100** — Critical Blocker

> **Stop and read this first.** Every other finding in this report is academic until the blocker below is resolved. The audit was unable to evaluate citability, schema, passage quality, or platform-specific signals because the Astro 6 app described in `CLAUDE.md` is **not deployed to `uishades.com`**.

### What's actually live at uishades.com

| Signal | Observed | Expected (per CLAUDE.md) |
|---|---|---|
| Server | `hcdn` (Hostinger CDN) | Cloudflare (`cf-ray` header) |
| DNS A record | `2.57.91.91` (Hostinger parking IP) | Cloudflare anycast (104.x / 172.66.x) |
| `<title>` | `Parked Domain name on Hostinger DNS system` | `uishades — free OKLCH shade generator` (or similar) |
| `<meta name="robots">` | `noindex, nofollow, noarchive, nosnippet` | (none / `index, follow`) |
| `robots.txt` | `User-agent: *` + `Disallow: /` | Allow all + sitemap declaration |
| `Cache-Control` | `no-store` | `public, max-age=…` (30-day per CLAUDE.md) |
| Routes tested | All three URLs return the same parking HTML | Distinct routes per page template |
| `uishades.pages.dev` | Not reachable | Should serve the build if project name matches |

**Conclusion:** `uishades.com` currently resolves to a parked Hostinger domain that explicitly tells every crawler — search engines and AI alike — to ignore it. The Cloudflare Pages deployment is either not configured at this domain or is under a different `*.pages.dev` slug.

---

## Platform Breakdown (Current State)

| Platform | Score | Reason |
|---|---|---|
| Google AI Overviews | 0 / 100 | `noindex` + `Disallow: /` → never indexed → never cited |
| ChatGPT search (GPTBot, OAI-SearchBot, ChatGPT-User) | 0 / 100 | Blocked by `Disallow: /` |
| Perplexity (PerplexityBot, Perplexity-User) | 0 / 100 | Blocked by `Disallow: /` |
| Bing Copilot (Bingbot) | 0 / 100 | Blocked by `Disallow: /` |
| Claude web (ClaudeBot) | 0 / 100 | Blocked by `Disallow: /` |

---

## AI Crawler Access Status

`https://uishades.com/robots.txt`:

```
User-agent: *
Disallow: /
```

Every AI crawler — GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, anthropic-ai, PerplexityBot, Perplexity-User, CCBot, Google-Extended, Applebot-Extended, Bytespider, cohere-ai, Meta-ExternalAgent, Diffbot, Amazonbot — is blocked by the catch-all rule. The Hostinger parking page also injects `<meta name="robots" content="noindex, nofollow, noarchive, nosnippet">` in HTML, which compounds the block at the page level even for crawlers that ignore robots.txt.

The `public/robots.txt` checked into this repo (allow-all + sitemap declaration) is the correct file — but it is **not being served**, because the build is not deployed to this domain.

---

## llms.txt Status

| File | HTTP | Result |
|---|---|---|
| `/llms.txt` | 200 OK | Returns Hostinger parking HTML (not a valid llms.txt) |
| `/llms-full.txt` | 200 OK | Returns Hostinger parking HTML (not a valid llms-full.txt) |

The 200-OK-with-HTML behavior is worse than a 404 — AI crawlers that probe for `llms.txt` will see HTML instead of a missing-file response, which is ambiguous and can mis-cache. (Once the real deployment is live this will go away on its own; flagged for awareness.)

---

## Passage-Level Citability — Cannot Evaluate

The repo contains strong citability material that the audit could not reach in production:
- 209 named-color pages each with editorial blurbs (`src/pages/colors/[name].astro` → `src/lib/data/named-colors.ts`).
- Homepage "Why" sections explaining OKLCH algorithm, Classic toggle, Tailwind-first exports.
- Structured factual data (OKLCH L/C/H, aliases, related colors) per color.

These will need to be re-audited against the live site once the domain is pointed correctly. Initial codebase signal is **strong** — blurbs are domain-specific prose with definitions, lists of aliases, and quotable facts.

---

## Schema Readiness — Cannot Evaluate Live

From the repo (`src/pages/index.astro`, `colors/[name].astro`, `[hex].astro`):

| Page | Schemas emitted | AI-citation readiness |
|---|---|---|
| `/` | Organization, WebSite (with SearchAction), SoftwareApplication | Good for entity + tool recognition |
| `/colors/[name]` | BreadcrumbList, CreativeWork (with keywords, alternateName, aliases) | Good factual graph |
| `/[hex]` | BreadcrumbList, CreativeWork (generic with hex identifier) | Adequate |

**Gap:** No FAQ schema, no HowTo schema. Both would lift citability for "what is X color" and "how to use OKLCH ramps" queries, which are exactly the kinds of questions AI engines re-emit.

---

## Brand Mention Signals — Not Measured

Brand-mention measurement (Reddit, YouTube, Wikipedia, LinkedIn) was deferred because there's nothing live to be mentioned **about** yet. Run this once the domain is pointing at the real site and there's ~30 days of indexable content.

---

## Top 5 Highest-Impact Changes

| # | Change | Effort | Impact | Why |
|---|---|---|---|---|
| 1 | **Point `uishades.com` DNS at Cloudflare Pages.** Confirm the Cloudflare project's custom-domain binding and update Hostinger nameservers (or the A/AAAA/CNAME records) to Cloudflare. | Low | Catastrophic | Until this is done, every other GEO change is invisible. |
| 2 | **Verify the Cloudflare deployment is healthy at its `*.pages.dev` URL.** The expected `uishades.pages.dev` was unreachable from my probe; either the project slug differs or the last deploy failed. Check the GitHub Actions log for the most recent run of `.github/workflows/deploy.yml`. | Low | Catastrophic | Must be live somewhere before DNS switch. |
| 3 | **Add `public/llms.txt`** with the site's purpose, key sections, and a small set of canonical color pages. Template provided below. | Low | High | AI crawlers increasingly probe for this; missing file = lower discoverability ceiling. |
| 4 | **Add FAQ schema** (`@type: FAQPage`) to `/colors/[name]` pages with 3–5 Q&A pairs per color ("What is coral?", "What hex codes are similar to coral?", "When should I use coral?"). Use existing blurb content as answers. | Medium | High | Direct citability lift for definition-style queries; uses existing data. |
| 5 | **Add an explicit AI-crawler allowlist** to `public/robots.txt` so the real deployment cannot regress to a blanket block by accident. Explicit `Allow:` lines for GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, PerplexityBot, Perplexity-User, Google-Extended, Bingbot. | Low | Medium | Defensive; also signals intent to crawler operators. |

---

## Quick Wins (post-DNS-fix)

1. Add `public/llms.txt` and `public/llms-full.txt`.
2. Add FAQ schema to named-color pages using `safeJsonForScript()`.
3. Add a one-sentence definition at the top of each named-color page ("Coral is a warm pink-orange color with hex `#ff7f50`…") — first 60 words is where AI engines lock onto definitions.
4. Add `lastReviewed` / `dateModified` to JSON-LD on color pages.
5. Add author/publisher Person + Organization sameAs links pointing at GitHub / project README.

## Medium Effort (post-DNS-fix)

1. Original research piece: "OKLCH vs HSL vs HSV for design systems" with measured contrast data — uniquely citable.
2. Build a Wikipedia or Wikidata entry for "uishades" only after meaningful inbound coverage exists (don't self-create).
3. Reddit presence: post a single high-quality thread on `r/web_design` or `r/userexperience` about the OKLCH ramp algorithm with permanent URL examples. (Validates Perplexity signal — Perplexity cites Reddit ~47% of the time.)

---

## Recommended Audit Re-Run

Re-run `/seo-geo` against the same three URLs **once** the following are all true:

1. `curl -I https://uishades.com/` returns `server: cloudflare` (or no Hostinger header).
2. `curl https://uishades.com/robots.txt` returns the repo's `public/robots.txt`, not `Disallow: /`.
3. The HTML at `/` contains the OKLCH-ramp marketing copy, not the Hostinger parking template.

Until all three are true, GEO recommendations beyond "fix the deployment" are speculative.

---

## Appendix: Minimal `public/llms.txt` template for after the fix

```
# uishades

> Free, ad-free OKLCH shade generator. Convert any hex color into a 22-step
> perceptual ramp or 11-stop Tailwind scale. Mirrors 0to255.com's URL structure
> with /[hex] and /colors/[name] permanent links.

## Core pages
- [Home](https://uishades.com/): Generate shades from any hex color.
- [Named colors](https://uishades.com/colors/coral): 209 CSS named colors with OKLCH ramps, aliases, and contrast badges.
- [Hex URLs](https://uishades.com/4040ff): Permanent /[hex] URL for any 6-digit hex.

## How the ramps work
- OKLCH mode: 22-shade perceptual ramp. 20 inner shades at evenly spaced lightness (L=0.05 to L=0.95) plus pure white and black endpoints. Chroma uses a bell-curve multiplier to stay inside the sRGB gamut.
- Classic mode: reverse-engineered RGB-walk that matches the pre-paywall 0to255.com output.
- Tailwind scale: 11-stop scale (50…950) snapping the input to its nearest stop.

## Exports
- CSS custom properties, Tailwind config, design tokens (W3C DTCG), SCSS map, JSON.

## Source
- GitHub: https://github.com/[owner]/color-shades (update with real URL)
- License: free, no ads, no tracking beyond first-party.
```

---

## Appendix: AI-crawler-friendly `public/robots.txt` template

```
# uishades — AI search and traditional crawlers welcome

User-agent: *
Allow: /
Disallow: /dev/
Disallow: /api/

# Explicit allow for AI crawlers (defensive; default is allow)
User-agent: GPTBot
Allow: /

User-agent: OAI-SearchBot
Allow: /

User-agent: ChatGPT-User
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: Perplexity-User
Allow: /

User-agent: Google-Extended
Allow: /

User-agent: Applebot-Extended
Allow: /

Sitemap: https://uishades.com/sitemap-index.xml
```
