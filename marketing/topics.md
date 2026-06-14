# Blog / article backlog

Topics for the content drafter (`agents/B-blog-drafter.md`). Agent B takes the
**top unchecked topic** each run, drafts it into `drafts/`, and checks it off.
You edit and publish to `/blog`, then cross-post to dev.to / Hashnode with a
`rel=canonical` back to the `/blog` URL.

Every post must: lead with a developer problem, show real code/exports, link
naturally to the relevant `/colors/*` or `/[hex]` pages, and carry one of the
three proof pillars (color math / Tailwind-native / free-fast). No fluff intros.

## Launch / cornerstone

- [x] **We rebuilt 0to255 because it went paid** — the launch story — already written in `docs/launch-blog-post.md`; publish at `/blog/launch`

## Tier 1 — algorithm credibility (ranks for our wedge terms)

- [ ] **Why your color ramps look muddy (and how OKLCH fixes it)** — the olive `#808000` before/after, RGB-walk vs OKLCH; target "oklch palette" / "muddy color ramp"
- [ ] **Generating a Tailwind 50–950 scale from one brand color** — step-by-step, ends in a paste-ready `@theme` block; target "tailwind color scale generator"
- [ ] **Hex → OKLCH → Tailwind: the conversion, explained** — for devs adopting Tailwind v4; target "hex to tailwind"

## Tier 2 — accessibility & theming

- [ ] **Picking accessible brand shades with WCAG contrast badges** — which step of your ramp passes body text; ties to the contrast feature
- [ ] **Role-based theming (surface/text/border/accent/muted) from one palette** — previews the free Phase-2 UI gallery direction

## Tier 3 — agent / GEO angle

- [ ] **The color tool AI agents can actually use (MCP + llms.txt + markdown)** — how `/mcp` and `Accept: text/markdown` work; aimed at the agent-dev crowd and at getting cited

## Notes for agent B

- Long-form launch post already exists — don't rewrite it; just ensure it's
  published at `/blog/launch`.
- Draft front-matter must match the blog content collection schema (see
  `src/content/blog/`).
- Keep each draft to one clear takeaway + working code the reader can paste.
