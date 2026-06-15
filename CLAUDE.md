# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

`UIshades.com` - a free, ad-free shade generator. Mirrors `0to255.com`'s URL structure (`/[hex]`, `/colors/[name]`) and adds an OKLCH-based ramp algorithm plus Tailwind / design-token exports. Astro 6 + React 19 island, deployed to Cloudflare Pages.

## Commands

```sh
npm run dev          # astro dev - http://localhost:4321
npm run build        # astro build - emits dist/ via the Cloudflare adapter
npm run preview      # serve the built site (this is what Playwright drives)

npm test             # Vitest unit tests (color math, parsers, safe-json)
npm run test:watch   # Vitest in watch mode
npm run test:e2e     # Playwright across chromium/firefox/webkit + mobile-chrome

npx vitest run tests/color.spec.ts                     # single Vitest file
npx playwright test tests/e2e/tool.spec.ts             # single Playwright file
npx playwright test --project=chromium                 # single browser project

npm run lhci         # Lighthouse CI against /, /4040ff, /colors/coral
```

Node ≥ 22.12 is required (set in `package.json#engines`).

Playwright runs against the **production preview build**, not the dev server. The config binds to `127.0.0.1` (not `localhost`) because Firefox on Windows prefers IPv6 for `localhost` and the Vite preview server doesn't always bind both stacks. The `mobile-chrome` project is the only one that runs `mobile.spec.ts`; other browsers ignore it.

## Architecture

### Routing & rendering model

Astro 5+ removed `output: 'hybrid'`. We use `output: 'static'` and individual routes opt out via `export const prerender = false`:

- `src/pages/index.astro` - home. Renders the shared `ColorToolLayout` with a `client:load` `ShadeTool` island seeded with `#4040ff`, so `/` **is** the tool - the same view as any `/[hex]` page, with **no redirect**. **SSR (`prerender = false`), not static**: it opts out of prerendering so it can answer `Accept: text/markdown` content negotiation for agents (the Cloudflare asset layer never runs middleware, so a prerendered page couldn't). The HTML branch sets a 30-day `Cache-Control` (`s-maxage=2592000`) + `Vary: Accept` like `/[hex]`. **IMPORTANT - these SSR routes are NOT edge-cacheable on Cloudflare Pages, and the `Cache-Control` header does not change that.** The Astro adapter deploys SSR routes as an advanced-mode Pages Function (`_worker.js`), and on Pages a **Function always runs in front of the cache - you cannot put a CDN cache in front of a Function** (verified empirically: responses carry `Server-Timing: cfWorker;dur=…` and *no* `cf-cache-status` header). A dashboard Cache Rule therefore cannot cache `/` or `/[hex]`; this was tried and confirmed inert. This is why the dashboard Cache Hit Rate sits near ~1.5% - and it's benign: `cfOrigin;dur=0` (no origin cost) and the render is ~11ms. The `Cache-Control` header still informs browser/downstream caches; `Vary: Accept` is sent for correctness but **Cloudflare ignores it** (only `Vary: Accept-Encoding` is honored). The only ways to actually cache these would be the worker-side Cache API (`src/lib/edge-cache.ts`, saves render CPU but does NOT cut Function invocations or produce a `HIT`) or prerendering the routes (which would forfeit the `Accept: text/markdown` content negotiation). The 386 cache hits you *do* see are static assets (`/_astro/*`, prerendered `/colors/*`) - those are excluded from the Function via `_routes.json` and cache normally. To protect the Function invocation quota from crawlers, use Bot Fight Mode / robots, not caching (see `edge-cache.ts`). Keeps the site-level Organization / WebSite / SoftwareApplication JSON-LD (referenced by other pages via their `@id`s, so it must live here); because `/` is no longer auto-enumerated, `astro.config.mjs` injects it into the sitemap `customPages`. The island rewrites `/` → `/[hex]` in place via `history.replaceState` on the first user-initiated color change (never on load), re-seeds the visitor's last-used color from `localStorage` after hydration, and still honors the `?hex=` SearchAction deep link.
- `src/layouts/ColorToolLayout.astro` - the shared document shell for the tool surfaces: `/`, `/[hex]`, `/color-palette-generator`, and `/image-color-picker`. It wraps `<head>` (BaseHead + meta/OG/twitter from props + a `head` slot for page-specific JSON-LD) plus the `<main>` / sr-only `<h1>` / `ShadeTool` island / footer, and forwards a `mode` prop (`'default' | 'image' | 'palette'`) straight to the island. **Edit layout here and it hits all four URLs** - don't re-inline a tool-page shell in a route.
- `src/pages/colors/[name].astro` - pre-rendered, one page per entry in `NAMED_COLORS` (~209 pages). `getStaticPaths()` enumerates slugs. Keeps its own richer editorial shell (hero, blurb, palette, FAQ) and embeds the shared `ShadeTool` island directly rather than going through `ColorToolLayout`.
- `src/pages/[hex].astro` - **SSR-only** (`prerender = false`). Validates the hex param with a strict regex, returns 404 on miss, sets a 30-day `Cache-Control` (`s-maxage=2592000`) + `Vary: Accept`. Note this is **not** edge-cached on Cloudflare Pages - the SSR Function runs in front of the cache and cannot be CDN-cached (see the `index.astro` note above for the full explanation and why the ~1.5% cache hit rate is expected and benign). The header still serves browser/downstream caches. Renders through `ColorToolLayout`, injecting its BreadcrumbList + CreativeWork JSON-LD via the `head` slot. Like `/`, answers `Accept: text/markdown` with the markdown palette (see Agent-readiness below).
- `src/pages/color-palette-generator.astro` - **prerendered, indexable** marketing/tool page. Renders `ColorToolLayout` in `mode="palette"`, so the island opens straight into multi-color palette view with the tray pre-seeded (brand + Neutral / Success / Warning / Error roles, via `buildSeededPaletteTray`). Has no canonical color and nothing to content-negotiate, so unlike `/` it stays static with its own title/description/OG + editorial copy + JSON-LD. Stable `/color-palette-generator` URL (palettes are saved/shared via the account system, not per-URL).
- `src/pages/image-color-picker.astro` - **prerendered, indexable** page. Renders `ColorToolLayout` in `mode="image"`, which mounts the source-image panel (`ImagePalettePanel`) above the tool and makes the uploaded image the only editor of palette colors. The image never leaves the browser, so there's no shareable result and the route is always `/image-color-picker`. Same static/SEO posture as the palette generator.
- `src/pages/blog/index.astro` + `src/pages/blog/[slug].astro` - prerendered blog backed by the `blog` content collection (`src/content.config.ts`); `[slug]` enumerates posts via `getStaticPaths()` and skips drafts in `PROD`.
- `src/pages/dev/tool.astro` - dev-only host for the React island. Returns 404 in `PROD` builds; `noindex` + excluded from the sitemap regardless.
- `src/pages/api/[hex].json.ts` and `src/pages/og/[hex].png.ts` - JSON and OG endpoints (the OG endpoint uses `workers-og`). The JSON endpoint builds its payload via the shared `buildColorPageData` (see below).
- `src/pages/mcp.ts` - **SSR-only** public MCP endpoint (`/mcp`, streamable HTTP / JSON-RPC 2.0). Thin transport wrapper over the pure `handleMcpRequest` dispatcher in `src/lib/mcp/handler.ts`; exposes one tool, `generate_shades`. Unauthenticated by design; not under `CSRF_PROTECTED_PREFIXES` so cross-origin agent POSTs pass the middleware gate.

`astro.config.mjs` injects `POPULAR_HEXES` into the sitemap via `customPages` so Googlebot can find SSR-only hex URLs without manual warming, and filters `/dev/*` out as a belt-and-braces measure on top of the page-level `noindex`.

### Color math (`src/lib/color/`)

This is the codebase's core. The contract lives in `types.ts` - every other module codes against `Hex`, `OKLCH`, `Shade`, `ContinuousRamp`, `TailwindScale`. Do not redefine these elsewhere.

- `parse.ts` - `parseColor`, `toOklch`, `oklchToHex`. Wraps `culori`. Throws `ParseError` on bad input.
- `ramp.ts` - `oklchRamp(input)`: 11-shade OKLCH ramp (`INNER_STEPS = 11`, sized to match the Tailwind scale's 11 stops so the two views are an apples-to-apples "same scale, two algorithms" pair). 11 inner shades at evenly spaced lightness between L=0.95 and L=0.06 (no pure `#ffffff` / `#000000` endpoints - L=0.06 lower bound keeps achromatic inputs off pure black after sRGB rounding). The input hex is pinned verbatim at the inner step whose target L is closest to the input's measured L. Chroma uses a bell-curve multiplier (1.0 at L=0.5, 0.3 at the extremes) to avoid washed-out sRGB-gamut clipping near white/black. **Exports, on-screen row labels, and the markdown table all key the ramp to the same `50…950` Tailwind stop labels** (index 0 → 50, last → 950) via `STOPS` - `rampToTokens` (`exports/tokens.ts`), `ContinuousRamp`/`PaletteShadeGrid` gutter labels, and `colorPageMarkdown` - so an OKLCH export is a drop-in token scale, not non-standard `brand-1…N` keys.
- `classic.ts` - `classicRamp(input)`: the reverse-engineered 0to255 RGB-walk. **Retained and unit-tested, but no longer surfaced in the UI** - the algorithm toggle now switches between the Tailwind scale and the OKLCH ramp, so nothing imports `classicRamp` outside its own test. Kept so it can be re-enabled cheaply; don't delete it without cause. Lighter walk increments every sub-255 channel by 17 each step; darker walk has a two-phase rule with residual-carry from "low" to "high" channels to match the pre-paywall reference output verbatim. The walks' pure `#ffffff` and `#000000` tails are stripped from the composed ramp; when the input itself is white or black it is preserved as an interior shade. Edge cases for `#ffffff`, `#000000`, and `#ff0000`-style inputs (no low channels) are documented in-file.
- `scale.ts` - `buildScale(input)`: 11-stop Tailwind scale (50…950) snapping the input to its nearest stop.
- `anchors.ts`, `contrast.ts`, `format.ts` - anchor stops, WCAG contrast badges, copy-format serialization.
- `page-data.ts` - `buildColorPageData(canonical)`: assembles the shared `ColorPageData` (ramp + scale + 3-up/3-down neighbors). **Single source of truth** reused by the JSON API, the markdown content-negotiation branch, and the MCP `generate_shades` tool, so all three stay identical. `src/lib/markdown/color-page.ts` (`colorPageMarkdown`) renders it to agent-readable markdown.

### Token exports (`src/lib/exports/`)

`tokens.ts` is the hub: both palette shapes normalize to `ColorGroup[]` (each `{ name, tokens, semantic?, anchorKey?, source? }`), and the six serializers code against that array. The exports are **two-tier** for the three CSS-based formats (`tailwind-v4`, `css-vars`, `tailwind-v3`):

- **Tier 1 — primitives**, keyed by `ColorGroup.name` = the color's own name (`--color-sandy-brown-500`; nearest-named slug, deduped via `dedupeGroupNames`).
- **Tier 2 — semantic aliases**, emitted only when `ColorGroup.semantic` is set (the user's editable role label, e.g. Primary). `semanticTokens(group)` applies a fixed default variant set — base (`anchorKey` stop) / `hover` (+1) / `active` (+2) / `surface` 50 / `muted` 100 / `border` 200 / `emphasis` 800, plus a WCAG-picked `on-<role>` foreground (`contrastRatio`, white vs the 950 shade). v4/css-vars emit live `var()` aliases; v3 (a JS config) emits resolved-hex snapshots. The three JSON formats (`w3c-tokens`, `figma-vars`, `style-dictionary`) ignore `semantic` and stay tier-1 only.

A group with no `semantic` produces byte-identical legacy single-tier output. In `ShadeTool.tsx`, `paletteColorNames` (deduped color names) feeds BOTH the tier-1 primitives AND the grid's per-column copy labels (`bg-<name>-500`), so on-screen copies resolve against the exported primitives; `paletteNames` (semantic role slugs) feeds only tier 2.

### React island (`src/components/ShadeTool.tsx`)

Top-level `client:load` island. Owns hex, view selection, and copy/export format preferences. The view selection is a single **Algorithm** toggle (`AlgorithmToggle`) switching between the **Tailwind** 11-stop scale (the default) and the **OKLCH** 11-shade continuous ramp (both keyed to the same `50…950` stops; see `ramp.ts` note above). The underlying state is still `view: 'ramp' | 'scale'` (`'scale'` = Tailwind, `'ramp'` = OKLCH), so the `?view=` URL contract and the `shades.view` localStorage key are unchanged - only the labels and default flipped. There is no longer a separate ramp-mode (oklch/classic) toggle; the classic walk is retired from the UI (see `classic.ts` note below). **Preference precedence is URL > localStorage > server-default**, layered to avoid hydration mismatches: initial render uses what the server saw, then post-hydration localStorage is read; if it disagrees with the URL the URL wins.

A `mode` prop (`'default' | 'image' | 'palette'`, threaded from `ColorToolLayout`) selects the surface: `'default'` is the homepage / `[hex]` tool (URL-rewriting, last-used-color persistence); `'palette'` opens the multi-color tray pre-seeded by `buildSeededPaletteTray`; `'image'` mounts the lazily-loaded `ImagePalettePanel` (`React.lazy`) and makes the uploaded image the authoritative source of palette colors. The color input is `ColorPicker` (a react-colorful popover + hex/named-color text field; **this replaced the old standalone `ColorInput`, which has been removed**) - `PaletteEditor` reuses the same `ColorPicker`. Each palette swatch in the tray can itself become an inline `ColorPicker` for editing.

Because the Tailwind scale is the default view, its grid ships eagerly and is server-rendered (real 11-stop content on first paint - important for SEO/GEO since this is now the SSR'd content on `/` and `/[hex]`). The lazy boundary therefore lives *inside* `TailwindScale`, wrapping only the heaviest leaf - `ExportDropdown` plus the five export-format serializers (`src/lib/exports/`) - via `React.lazy` + `Suspense`. Its fallback (`ExportDropdownFallback`) reserves just the export-controls row height. The OKLCH continuous ramp is eager too (it only reuses the shared `ShadeRow`), so toggling between the two views is instant.

Both views' "Download PNG" button renders the palette client-side to a canvas via `src/lib/exports/ramp-png.ts`, which is dynamically `import()`-ed inside the click handler so the canvas code stays out of the eager ramp chunk. Keep `ramp-png.ts` free of static imports from any eager-path module. The drawing function takes a plain `Shade[]` (the ramp and the 11-stop Tailwind scale both feed it; scale shades render their stop label too). The `variant` option only tags the download filename (`uishades-<hex>-<oklch|classic|scale>.png`).

`ShadeTool.tsx` imports `findByHexSlim` from `named-colors-slim.ts` (not the full `named-colors.ts`) so the React island doesn't drag the blurb-bearing data set into its bundle. The full module is consumed only by build-time / SSR Astro pages (`src/pages/colors/[name].astro`, `colors/index.astro`, `[hex].astro`), never by the island. Respect this split when adding consumers.

### Data sources (`src/lib/data/`)

- `named-colors.ts` - full ~209-entry list with blurbs, aliases, related slugs. Build-time only.
- `named-colors-slim.ts` - hex-lookup-only subset for the React island.
- `popular-hexes.ts` - 2131-entry hex list, sitemap-injected.

`README.md`'s perf-budget section flags that splitting blurbs from lookup keys is the right next step for shrinking initial-load JS. Touch this only deliberately - both files are imported from boundary code that depends on their exact shape.

### Auth, sessions & palettes (`src/lib/auth/`, `src/pages/api/`)

A full account system the original color-tool docs predate (Phase 1 of the palettes feature). **Email is the single identity key** across Google OAuth, GitHub OAuth (via `arctic`), and magic links: `findOrCreateUserByEmail` (`db.ts`) links providers by *verified* email, so every caller MUST gate on a verified email first (the OAuth callbacks do). Sessions live in Cloudflare KV via Astro's session API; `loginUser` (`session.ts`) **regenerates the session id on login** (anti-fixation). All data access is in `src/lib/auth/db.ts` (D1/SQLite, dependency-injected `DB` binding so it's unit-testable with a mock) - schema in `migrations/`. Every value is parameter-bound; the two dynamic-SQL spots (`UPDATE palettes SET ${sets.join(', ')}` ~L621 and the explore `prepare(sql)` builder ~L895) interpolate only hardcoded column/clause whitelists, never user input - keep it that way.

API routes (`src/pages/api/`) fall into four buckets: session-gated owner-scoped CRUD (`palettes`, `palettes/[id]`, `presets` - wrapped in `withUser`, every query carries `… AND user_id = ?`, and missing/foreign rows return **404 not 403** to avoid existence leaks); anonymous rate-limited writes (`palettes/[id]/report`, `palettes/[id]/vote`, `feedback`); public read feeds (`explore`, `p/[slug].json`, `[hex].json`); and the inert token-gated `admin/backfill` (404s until `ADMIN_BACKFILL_TOKEN` is set, constant-time compare). Rate limiting reuses the `magic_link_requests` table keyed by prefix (`magic:`/`email:`/`ip:`/`report:<id>`/`fb-ip:`). **Gotcha:** `pruneMagicRequests` deletes by `created_at` with no key filter, so it also expires the `report:<id>` tally rows the report endpoint intends to keep forever, and the magic-link limiter is check-then-record (non-atomic). See `docs/audit-2026-06-04.md`.

`/p/[slug]` and `/explore` render saved palettes; `/explore` lists only `SEED_OWNER_ID` (curated) palettes, so a regular user's public palette is reachable only by its unguessable-suffix slug. `getPaletteBySlug` returns null for private/flagged palettes when called without a `viewerId`, so the public surfaces never leak them. Profanity moderation (`moderation.ts`, explicitly "not a security control") guards palette *names* but **not descriptions** - a known content gap.

### Security headers (`src/middleware.ts`)

Auto-discovered Astro middleware. Sets HSTS, X-CTO, X-Frame-Options, Referrer-Policy, Permissions-Policy, and CSP on every response (both SSR routes and pre-rendered pages). CSP currently keeps `'unsafe-inline'` on `script-src` for JSON-LD blocks and the home-page inline form-handler; the audit tracks tightening via nonces.

**CSRF / cross-origin POST defense (verified — don't be misled by stale in-code comments).** `middleware.ts` runs an explicit `isCsrfBlocked` same-origin gate (`csrf.ts`) on state-changing requests under `CSRF_PROTECTED_PREFIXES` before `next()`. This is a **stricter superset** of Astro's built-in origin check, NOT a stand-in for an absent one: the `@astrojs/cloudflare` adapter declares `adapterFeatures.buildOutput:'server'`, which makes Astro compute `manifest.checkOrigin = true` and register `createOriginCheckMiddleware`, so the built-in check **is active in production** (traced to installed `node_modules` source). Comments in `csrf.ts` / `magic/callback.ts` / `csrf.spec.ts` asserting "checkOrigin is a no-op under `output:'static'`" are **factually wrong** - the adapter overrides `buildOutput` after the static default is set. The manual gate still earns its keep: it also blocks cross-origin `application/json` POSTs (the built-in check only 403s form-like/bodyless bodies) and honors `Sec-Fetch-Site`, so **do not delete it thinking it duplicates the framework**. Known drift: `CSRF_PROTECTED_PREFIXES` omits `/api/palettes` even though `PRIVATE_API_PREFIXES` (cache-control) includes it - no live exploit (SameSite=Lax + JSON-body + the active built-in check all backstop it) but the `report.ts` docstring's "CSRF enforced upstream" claim is currently false for that path. See `docs/audit-2026-06-04.md`.

All inline JSON-LD blobs MUST go through `safeJsonForScript()` (`src/lib/safe-json.ts`) - it escapes `<`, `>`, `&`, U+2028, U+2029 so future user-derived fields can't break out of the inline `<script>` block. Already wired in `index.astro`, `[hex].astro`, `colors/[name].astro`.

Two header sets must stay in sync (documented in both files): `SECURITY_HEADERS` in `src/middleware.ts` (SSR responses) and `public/_headers` (statically-served pages). This now includes the agent-discovery `Link:` header.

### Agent-readiness

Surfaces that make the site usable by AI agents (see `docs/agent-readiness.md` and Cloudflare's "Is Your Site Agent-Ready?" scan):

- **`Link` headers** (RFC 8288) advertise `/.well-known/api-catalog` + `/llms.txt` - set in both `_headers` and middleware.
- **Markdown negotiation**: `/` and `/[hex]` answer `Accept: text/markdown` with `colorPageMarkdown(buildColorPageData(...))`. The response sets `Vary: Accept`, but **Cloudflare ignores `Vary: Accept`** (only `Vary: Accept-Encoding` is honored). This is safe only because these SSR routes aren't edge-cached at all (the Pages Function runs in front of the cache - see the `index.astro` routing note), so each request is computed fresh and the right representation is always returned. Caveat for the future: if you ever prerender or otherwise CDN-cache these routes, content negotiation **will** break (a browser could get cached markdown or an agent cached HTML) - you'd then need to gate on the `Accept` header, not `Vary`.
- **`/.well-known/` discovery files** (static, in `public/`): `api-catalog` (RFC 9727 linkset → `openapi.json`), `agent-skills/index.json` (v0.2.0, **digests must match the SKILL.md bytes** - rehash if you edit them), `mcp/server-card.json`, `auth.md` (honest "no auth" - we are NOT an OAuth AS). `_headers` sets their content types.
- **MCP**: `/mcp` endpoint + `server-card.json` (see routing above).
- **WebMCP**: `registerWebMcpTools` (`src/lib/mcp/webmcp.ts`) registers `set_color` / `get_current_palette` on `navigator.modelContext` from the island; feature-detected, no-op where unsupported.
- **robots.txt** carries a `Content-Signal:` directive mirroring the existing allow-citation / block-training policy.
- **DNS-AID** is the one check not doable from the repo (needs DNS records) - records + steps are in `docs/agent-readiness.md`.

### Deploy

Pushes to `main` trigger `.github/workflows/deploy.yml` → Cloudflare Pages (project `uishades`). CI (`ci.yml`) runs build + Vitest + full Playwright matrix on every PR. Lighthouse CI (`lhci.yml`) runs separately.

## Conventions worth knowing

- `Hex` is canonical `#rrggbb` (lowercase, 7 chars, always with hash) anywhere in the type system. `parseColor` is the only entry point for raw user input.
- Pre-rendered named-color pages can't see search params at build time - they render the default Tailwind scale, so `?view=ramp` deep links briefly show the scale before swapping to the OKLCH ramp on hydration. This is intentional; opting these pages out of pre-rendering would lose the SEO win.
- The `label-content-name-mismatch` Axe finding on shade rows is intentional and informative-only (badges are aria-hidden so the row's accessible name reads as one coherent contrast summary). Don't "fix" it.
- ShadeTool's "current hex" is URL-synced via `history.replaceState`. On the dev page (`/dev/tool`) it updates `?c=` instead so refresh doesn't drop the user onto the real route.
