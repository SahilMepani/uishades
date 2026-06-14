# One-time marketing setup (manual)

Everything here is a dashboard / account step — no code. Do these once so the
autonomous agents (`agents/`) have data to work with.

## 1. Analytics (already wired in code — just turn it on)

The CSP in `src/middleware.ts` + `public/_headers` already allow-lists GTM,
GA4, and Cloudflare Web Analytics, and the **GTM container `GTM-W6D48RVL` is
already loaded** in `src/components/BaseHead.astro`. So:

- **Option A (recommended, lowest effort):** In the **GTM dashboard** for
  `GTM-W6D48RVL`, add a GA4 Configuration tag (or a privacy-friendly/cookieless
  analytics tag) and publish the container. No deploy needed — the loader is
  already live. Verify with GTM Preview that the tag fires on `/`, `/[hex]`,
  and `/colors/*`.
- **Option B:** In the **Cloudflare dashboard → Pages project `uishades` → Web
  Analytics**, enable it. The RUM beacon auto-injects and CSP already allows it.
  Cookieless, no GTM tag needed. (You can run A and B together.)

Pick at least one. North-star metric (weekly *active shaders* = copy/export
events) is easiest via a GTM event on the copy/export buttons — add a custom
event tag if you want intent, not just pageviews.

## 2. Google Search Console

- Add `https://uishades.com` as a property (DNS or the GTM/HTML-tag method —
  GTM is already present, so the GTM verification option works with no deploy).
- Submit the sitemap: `https://uishades.com/sitemap-index.xml`.
- This is required for agent E's SEO health section; until it's verified, agent
  E runs in degraded (search-only) mode.

## 3. Wire the autonomous agents

For each file in `marketing/agents/` create a routine with the `/schedule`
skill, pasting that file's "Schedule prompt", at the cadence noted at its top:

| Agent | Cadence |
|---|---|
| A — pSEO engine | weekly (Mon) |
| B — blog drafter | weekly |
| C — community drafter | 2–3×/week |
| D — citation monitor | daily |
| E — weekly report | weekly (Fri) |
| F — SEO/GEO guard | on marketing PRs + weekly |

Agents D and E can read more once you provide credentials in their routine env:
- **Cloudflare Analytics GraphQL API token** (Account Analytics: Read) for CF
  Web Analytics data.
- **Search Console API** access (service account or OAuth) for GSC data.
Without these they run search-only and say so — still useful.

## 4. Launch prerequisites (see the plan, §2)

- [ ] Build `/blog` route + publish `docs/launch-blog-post.md` at `/blog/launch`.
- [ ] Render the olive `#808000` RGB-vs-OKLCH comparison image for socials.
- [ ] Confirm `/` and `/[hex]` "demonstrate before explain" (Phase-1 UX).
- [ ] Run the `seo-geo-audit` skill — must pass.
