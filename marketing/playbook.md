# Voice & posting playbook

Every agent and every human post follows this. The fastest way to kill this
product's reputation is to look like spam in a dev community.

## Voice

- Plain, technical, peer-to-peer. You're a dev who built a thing, not a brand.
- Lead with the problem, not the product. "0to255 went paid and its mids drift
  muddy" before "check out my tool".
- Show, don't claim: a code block, an export, a before/after beats an adjective.
- No hype words: "revolutionary", "game-changing", "seamless", "effortless".
- One link, in context. Never a link with no substance around it.
- British/American spelling: match the existing copy (it uses "colour" in the
  blog, "color" in product strings — keep each surface internally consistent).

## The three proof pillars (every post leans on ≥1)

1. **Better color math** — OKLCH keeps mids on-hue (olive `#808000` demo).
2. **Tailwind-native** — paste-ready `@theme` / v3 / CSS vars / tokens / Figma.
3. **Free, ad-free, no signup, ~20KB/page.**

Secondary (second-wave only): **agent-ready** — MCP, llms.txt, markdown.

## Community rules (Reddit / HN / forums)

- **Read the subreddit's self-promo rules first.** Many require a ratio of
  participation to promotion. Honor it.
- HN: `Show HN:` only for the main launch. Otherwise comment with value, link
  only when directly relevant to the question asked.
- Reddit: tailor the angle per sub (r/webdev = utility, r/tailwindcss =
  `@theme`, r/web_design = contrast badges). Never cross-post identical text.
- **Reply opportunities** (someone asking "best color shade tool?"): answer the
  question usefully *first*; mention UIshades as one option, disclose it's
  yours. Never astroturf, never sockpuppet, never fake a testimonial.
- Cadence: at most a few promotional touches per week per platform. When in
  doubt, contribute without linking.

## Hard NOs

- No auto-posting to any community site (ban risk — agents draft, humans post).
- No monetization / "Pro" / "upgrade" language.
- No claiming open-source, MIT, or a public GitHub repo (it's private).
- No false performance/caching claims — the SSR routes are **not** edge-cached
  on Cloudflare Pages (see `CLAUDE.md`); say "renders ~11ms on demand", not
  "cached at the edge".
- No DMing strangers, no buying upvotes, no engagement pods.

## Disclosure

When posting your own tool, say so ("I built this"). It builds trust and is
required by most platforms' rules.
