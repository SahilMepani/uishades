# UIshades SEO/GEO surface map

Ground truth for the audit, captured from the repo. Verify against the live
files before reporting a finding — code moves. Line numbers are approximate;
the identifiers and paths are exact.

## Route templates (3 shapes)

| Shape | File | Render | Markdown negotiation? |
|---|---|---|---|
| `/` | `src/pages/index.astro` | SSR (`prerender = false`) | **Yes** |
| `/[hex]` (e.g. `/4040ff`) | `src/pages/[hex].astro` | SSR (`prerender = false`) | **Yes** |
| `/colors/[name]` (e.g. `/colors/coral`) | `src/pages/colors/[name].astro` | Prerendered (~209 pages) | **No** — static HTML only |

`/` and `/[hex]` share the document shell `src/layouts/ColorToolLayout.astro`.
`/colors/[name]` has its own richer editorial shell and does NOT go through the layout.

## Meta / title / canonical

Set in `ColorToolLayout.astro` from props: `title`, `description`, `canonical`,
`ogType`, `ogImage`, `ogImageAlt`, optional `ogImagePin` (Pinterest portrait),
`twitterImage`. The `<slot name="head" />` is where per-page JSON-LD is injected.

- Home: `TITLE` / `DESCRIPTION` / `OG` constants in `index.astro`; canonical `https://UIshades.com/`.
- Hex: `canonicalUrl = https://UIshades.com/${hexWithoutHash}`; title/description vary on whether the hex maps to a `NamedColor` (`findByHex`).
- Named: title `"{name} ({HEX}) Color Shades, Tints & Palette | UI Shades"`; description is sentence-aware truncated to ≤160 chars.

`src/components/BaseHead.astro` carries charset, viewport, generator, favicon (`?v=N` cache-buster), self-hosted fonts.

Site base in `astro.config.mjs`: `site: 'https://UIshades.com'`, `trailingSlash: 'never'`, `build.format: 'file'`.

## JSON-LD graph

All blocks are emitted as `<script type="application/ld+json" set:html={safeJsonForScript(...)} />`.
`safeJsonForScript` lives in `src/lib/safe-json.ts` (escapes `< > & U+2028 U+2029`).

**Defined on `/` (index.astro)** — the site-level graph other pages point at:
- `Organization` `@id: https://UIshades.com/#org`
- `WebSite` `@id: https://UIshades.com/#website` (`publisher → #org`, has `SearchAction` to `/?hex={search_term_string}`)
- `SoftwareApplication` `@id: https://UIshades.com/#app` (`publisher → #org`)

**On `/[hex]` (hex.astro):**
- `BreadcrumbList`
- `CreativeWork` `@id: {canonicalUrl}#page`, `isPartOf → #website`, `publisher → #org`

**On `/colors/[name]`:**
- `BreadcrumbList`
- a CollectionPage/CreativeWork-style block referencing `#website`
- `FAQPage`

Key invariant: every `@id` *referenced* (`{"@id": "...#org"}` with no `@type`)
must be *defined* somewhere on the site (it lives on `/`). A single HTML page does
not self-resolve cross-page refs — that's intentional here (CLAUDE.md), but it
means the homepage must always carry `#org`/`#website`/`#app`, and the strings
must be byte-identical everywhere (watch host casing).

## Markdown content negotiation (GEO)

Only `/` and `/[hex]`. The branch:
```
if ((Astro.request.headers.get('Accept') ?? '').includes('text/markdown')) {
  return new Response(colorPageMarkdown(buildColorPageData(HEX)), {
    headers: {
      'content-type': 'text/markdown; charset=utf-8',
      'cache-control': 'public, s-maxage=2592000, stale-while-revalidate=86400',
      vary: 'Accept',
    },
  });
}
```
- `buildColorPageData` — `src/lib/color/page-data.ts` (shared by JSON API, markdown, MCP).
- `colorPageMarkdown` — `src/lib/markdown/color-page.ts`.
- HTML branch sets the same `Cache-Control` + `Vary: Accept`.
The `Vary: Accept` is load-bearing: without it the edge serves whichever variant
it cached first to everyone.

## .well-known discovery

```
public/.well-known/
├── api-catalog                              (application/linkset+json)
├── auth.md                                  (honest "no auth")
├── mcp/server-card.json
└── agent-skills/
    ├── index.json                           (v0.2.0; carries sha256 digests)
    ├── generate-shades/SKILL.md
    └── color-conversion/SKILL.md
```
`index.json` lists each skill with a `digest: "sha256:<hex>"` over the SKILL.md
**bytes**. Editing a SKILL.md without rehashing breaks the digest — a hard finding.
Recompute: `sha256sum public/.well-known/agent-skills/<skill>/SKILL.md`.

`public/_headers` sets the content types for these files. `public/llms.txt`,
`public/robots.txt` (carries `Content-Signal:`) also exist.

## Dev page + sitemap

- `src/pages/dev/tool.astro`: returns `404` when `import.meta.env.PROD` **and** carries `export const prerender = false` (the latter is load-bearing — see below) plus `<meta name="robots" content="noindex,nofollow" />`.
  - **Why `prerender = false` is required:** without it the page prerenders to a static `dist/client/dev/tool.html`; Cloudflare's asset layer serves that file (200) and the runtime PROD 404 never runs. With it, no static file is emitted and the request falls through to the worker, which returns 404. (This was a real regression — `https://uishades.com/dev/tool` served 200 until `prerender = false` was added 2026-06.)
  - **`astro preview` fidelity trap:** `npm run preview` does NOT faithfully run the worker's SSR 404 for this route — it re-renders the page with PROD effectively false and returns **200** even when production correctly 404s. So a live HTTP probe against the local preview is *inconclusive* for `/dev/*`. The authoritative signals are: (1) `export const prerender = false` in source, and (2) **no `dist/client/dev/tool.html` after `npm run build`**. Only a 200 from the *real deploy* (`curl -sI https://uishades.com/dev/tool`) is a true failure.
- `astro.config.mjs` sitemap integration: `filter: (page) => !page.includes('/dev/')` and `customPages` injecting `https://UIshades.com/`, `/explore`, every `POPULAR_HEXES` hex URL, and `SITEMAP_PALETTE_SLUGS`.
- `POPULAR_HEXES` — `src/lib/data/popular-hexes.ts` (~2131 entries).

## Security / agent-discovery headers

Two synced sources (must match): `SECURITY_HEADERS` in `src/middleware.ts` (SSR
routes) and `public/_headers` (static pages). Both set the agent-discovery `Link`:
```
Link: </.well-known/api-catalog>; rel="api-catalog"; type="application/linkset+json",
      </llms.txt>; rel="alternate"; type="text/markdown"
```

## Commands / ports

- `npm run build` → `npm run preview` serves the built site at **http://127.0.0.1:4321** (Playwright drives this; bind `127.0.0.1`, not `localhost`).
- `npm run dev` → http://localhost:4321 (dev server; does NOT exercise prod 404s or the asset-layer `_headers`).
- The prod 404 for `/dev/*` and the `_headers` file only take effect against the **preview/built** site, not `astro dev`.

## Known consistency smell to check

Canonical/JSON-LD/`og:url` use mixed-case host `https://UIshades.com`; the
api-catalog anchor and `Link` headers use lowercase `https://uishades.com`. Hosts
are case-insensitive so this is cosmetic, but pick one and report drift.
