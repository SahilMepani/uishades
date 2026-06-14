# pSEO keyword backlog

Prioritized clusters for the pSEO content engine (`agents/A-pseo-engine.md`).
Agent A takes the **top unchecked cluster** each run, generates the pages,
opens a PR, and checks it off. Agent E (weekly report) re-orders this list
based on what's actually getting impressions in Search Console.

Format: `- [ ] <cluster> — <intent> — <page pattern> — <est. pages>`

## Tier 1 — high intent, we already half-own the surface

- [ ] **Tailwind shades of [color]** — devs wanting a paste-ready scale for a named color — extend `/colors/[name]` with a dedicated "Tailwind scale" section + FAQ entry; ensure the `@theme` export is above the fold — ~209 pages
- [ ] **[color] color palette / hex codes** — "olive color palette", "shades of teal hex codes" — strengthen the harmony/related section on `/colors/[name]` — ~209 pages
- [ ] **[color] tints and shades** — the 0to255 long-tail we inherit — confirm title/H1/FAQ target this phrasing on `/colors/[name]` — ~209 pages

## Tier 2 — new high-value hex clusters (feeds POPULAR_HEXES)

- [ ] **Brand hex colors** (e.g. Tailwind/Slack/Stripe/Discord brand hexes devs search) — add to `popular-hexes.ts` so `/[hex]` is sitemap'd and warm — ~100 hexes
- [ ] **Material / Tailwind default palette hexes** — the exact stop hexes people paste — add to `popular-hexes.ts` — ~250 hexes
- [ ] **"nice" / trending UI hexes** (from dribbble/coolors trend lists) — add to `popular-hexes.ts` — ~150 hexes

## Tier 3 — new route families (build a template, then fan out)

- [ ] **oklch palette generator / oklch color scale** — the algorithm-credibility query — a short `/blog` explainer + ensure llms.txt/keywords reflect it — landing + blog
- [ ] **tailwind color scale generator / tailwind 50-950 generator** — category head term — a dedicated landing section or `/blog` guide that ranks and links to the tool — landing + blog
- [ ] **hex to tailwind / convert hex to tailwind scale** — conversion intent — `/blog` how-to + internal links from `/colors/*` — blog

## Notes for agent A

- Reuse `buildColorPageData` (`src/lib/color/page-data.ts`) and
  `colorPageMarkdown` (`src/lib/markdown/color-page.ts`) — do not hand-roll
  ramp/scale data.
- Named-color content lives in `src/lib/data/named-colors.ts` (build-time
  only). Never import it into the React island.
- New hexes go in `src/lib/data/popular-hexes.ts`; they are injected into the
  sitemap via `astro.config.mjs` `customPages` — verify the count there.
- One cluster per PR. Title PRs `seo(pseo): <cluster>`.
