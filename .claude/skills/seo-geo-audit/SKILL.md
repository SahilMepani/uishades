---
name: seo-geo-audit
description: >-
  Audit the UIshades site for SEO and GEO (generative-engine optimization)
  regressions, scoped to this project's exact surfaces. Use whenever the user
  asks to audit, check, or validate SEO/GEO/agent-readiness, after editing any
  route template (index.astro, [hex].astro, colors/[name].astro), the JSON-LD
  graph, the layout/BaseHead, the .well-known files, SKILL.md discovery files,
  the sitemap config, robots.txt, llms.txt, the middleware/_headers, or before a
  deploy. Trigger on phrasings like "run an SEO check", "did I break the
  structured data", "is the markdown still served to agents", "are the agent
  digests stale", "audit before I push", or any change touching titles, meta,
  canonicals, structured data, content negotiation, or crawl/citation surfaces —
  even when the user doesn't say the word "SEO".
---

# UIshades SEO/GEO audit

This site is unusual: the GEO/agent-readiness layer (markdown negotiation, `/mcp`,
`llms.txt`, `.well-known/*`, a cross-referencing JSON-LD graph, `Content-Signal`)
is already mature. So this audit is about **catching regressions in surfaces that
are easy to break silently** — not bolting on generic SEO advice. Generic
checkers flag intentional choices here (e.g. the `label-content-name-mismatch`
Axe finding) and miss the things that actually matter.

`references/surfaces.md` is the ground-truth map of every surface — routes,
identifiers, file paths, the exact markdown-negotiation headers, the `@id` graph.
**Read it first.** Code moves; verify a finding against the live file before
reporting it.

## What this audit covers

| # | Check | Why it matters | How |
|---|---|---|---|
| 1 | Title / meta description / canonical — exactly one each, per route shape | Duplicates or a missing canonical across ~2300 templated URLs multiply into a sitewide problem | script (HTTP) |
| 2 | JSON-LD parses, and every referenced `@id` resolves | `#org`/`#website`/`#app` are defined only on `/`; a typo or host-casing drift silently breaks the graph | script (HTTP) |
| 3 | All inline `ld+json` goes through `safeJsonForScript` | Unescaped user-derived fields could break out of the `<script>` block | script (static) |
| 4 | `Accept: text/markdown` on `/` and `/[hex]` returns markdown with `Vary: Accept` | This is the core GEO surface; losing `Vary` makes the edge serve one variant to everyone | script (HTTP) |
| 5 | `.well-known/agent-skills` digests match the SKILL.md bytes | Editing a discovery SKILL.md without rehashing is the easiest silent break here | script (static) |
| 6 | `/dev/*` 404s in prod (needs `prerender = false` + no emitted `dist/client/dev/tool.html`); `noindex`; sitemap-excluded | Dev tooling leaking into the index | script (static build-output is authoritative; the live HTTP probe is *inconclusive* against `astro preview` — see surfaces.md) |
| 7 | Agent-discovery `Link` header advertises api-catalog + llms.txt | RFC 8288 discovery for agents | script (HTTP) |
| 8 | Host-casing consistency across canonical / JSON-LD / headers / catalog | Cosmetic but a real drift (`UIshades.com` vs `uishades.com`) | script (static) |

Items 1–8 are mechanical and live in `scripts/audit.mjs`. The **judgment layer**
below is yours — the script can't tell you a title is *bad*, only that one exists.

## How to run it

The script has two halves. Static checks read the repo and need no server. HTTP
checks need the **built preview** (`npm run dev` does NOT serve the prod `/dev`
404 or the `_headers` `Link` header — only the Cloudflare-built preview does).

```sh
# Fast pass — static only (digests, dev guards, sitemap, ld+json safety, host casing)
node .claude/skills/seo-geo-audit/scripts/audit.mjs

# Full pass — build + serve, then run everything
npm run build
npm run preview &            # serves http://127.0.0.1:4321
# wait for it to be ready, then:
node .claude/skills/seo-geo-audit/scripts/audit.mjs --base-url http://127.0.0.1:4321
# stop the preview when done (kill the background job)
```

The script prints `✅ PASS / ❌ FAIL / ⚠️ WARN / ℹ️ INFO` per check and exits
non-zero if anything is a hard FAIL. Run it from the repo root, or pass `--repo`.

If a preview is already running for another reason (e.g. Playwright), just point
`--base-url` at it.

## The judgment layer (do this after the script)

The script verifies *structure*; you verify *quality*. Spot-check one of each
route shape — `/`, a hex like `/4040ff`, and `/colors/coral`:

- **Titles & descriptions read well and stay in budget.** Descriptions should be
  ≤~160 chars and not truncate mid-word. The named-color description is
  sentence-aware truncated — confirm a long-blurb color (e.g. a color with a
  multi-sentence blurb) still produces a clean description.
- **Titles are differentiated, not boilerplate.** Across hex pages the only
  varying part is the hex/name — make sure that variable part is actually present
  and correct, not a stale constant.
- **The markdown payload is genuinely useful to an agent**, not just present.
  `curl -H 'Accept: text/markdown' http://127.0.0.1:4321/4040ff` and read it:
  does it carry the ramp, the Tailwind scale, contrast, and neighbor links? It
  should match what the JSON API and MCP tool return (all three share
  `buildColorPageData`).
- **OG image URLs resolve.** The script checks the tags exist; confirm
  `/og/4040ff.png` actually returns an image (200, `image/png`).
- **New JSON-LD you added is valid Schema.org**, not just well-formed JSON. If
  you added a type, sanity-check required properties for that type.

When the user changed something specific, weight the audit toward it: a layout
edit → re-check all three route shapes' heads; a `.well-known`/SKILL.md edit →
the digest check is the headline; a JSON-LD edit → the `@id` graph + parse checks.

## Reporting

Lead with **what regressed**, then **what's clean**, then **judgment notes**.
Quote the failing check name and the concrete value (the script already prints
these). For each FAIL, give the one-line fix — e.g. "rehash:
`sha256sum public/.well-known/agent-skills/generate-shades/SKILL.md` → update the
`digest` in `index.json`". Don't bury a real FAIL under a wall of green PASSes;
if everything passes, say so in one line and spend the words on the judgment
layer instead.

If you find something the script *should* have caught but didn't, that's a signal
to extend `scripts/audit.mjs` — tell the user, and add the check.
