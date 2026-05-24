# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

`uishades.com` — a free, ad-free shade generator. Mirrors `0to255.com`'s URL structure (`/[hex]`, `/colors/[name]`) and adds an OKLCH-based ramp algorithm plus Tailwind / design-token exports. Astro 6 + React 19 island, deployed to Cloudflare Pages.

## Commands

```sh
npm run dev          # astro dev — http://localhost:4321
npm run build        # astro build — emits dist/ via the Cloudflare adapter
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

- `src/pages/index.astro` — home, pure HTML/CSS, **no React island**. The hex input is a plain `<form>` whose inline JS canonicalizes and navigates. Resolves CSS-named colors (coral, rebeccapurple) via a build-time-baked subset.
- `src/pages/colors/[name].astro` — pre-rendered, one page per entry in `NAMED_COLORS` (~209 pages). `getStaticPaths()` enumerates slugs.
- `src/pages/[hex].astro` — **SSR-only** (`prerender = false`). Validates the hex param with a strict regex, returns 404 on miss, sets a 30-day `Cache-Control` so the Cloudflare edge caches the rendered HTML.
- `src/pages/dev/tool.astro` — dev-only host for the React island. Returns 404 in `PROD` builds; `noindex` + excluded from the sitemap regardless.
- `src/pages/api/[hex].json.ts` and `src/pages/og/[hex].png.ts` — JSON and OG endpoints (the OG endpoint uses `workers-og`).

`astro.config.mjs` injects `POPULAR_HEXES` into the sitemap via `customPages` so Googlebot can find SSR-only hex URLs without manual warming, and filters `/dev/*` out as a belt-and-braces measure on top of the page-level `noindex`.

### Color math (`src/lib/color/`)

This is the codebase's core. The contract lives in `types.ts` — every other module codes against `Hex`, `OKLCH`, `Shade`, `ContinuousRamp`, `TailwindScale`. Do not redefine these elsewhere.

- `parse.ts` — `parseColor`, `toOklch`, `oklchToHex`. Wraps `culori`. Throws `ParseError` on bad input.
- `ramp.ts` — `oklchRamp(input)`: 20-shade OKLCH ramp. 20 inner shades at evenly spaced lightness between L=0.95 and L=0.06 (no pure `#ffffff` / `#000000` endpoints — L=0.06 lower bound keeps achromatic inputs off pure black after sRGB rounding). The input hex is pinned verbatim at the inner step whose target L is closest to the input's measured L. Chroma uses a bell-curve multiplier (1.0 at L=0.5, 0.3 at the extremes) to avoid washed-out sRGB-gamut clipping near white/black.
- `classic.ts` — `classicRamp(input)`: the reverse-engineered 0to255 RGB-walk. Lighter walk increments every sub-255 channel by 17 each step; darker walk has a two-phase rule with residual-carry from "low" to "high" channels to match the pre-paywall reference output verbatim. The walks' pure `#ffffff` and `#000000` tails are stripped from the composed ramp; when the input itself is white or black it is preserved as an interior shade. Edge cases for `#ffffff`, `#000000`, and `#ff0000`-style inputs (no low channels) are documented in-file.
- `scale.ts` — `buildScale(input)`: 11-stop Tailwind scale (50…950) snapping the input to its nearest stop.
- `anchors.ts`, `contrast.ts`, `format.ts` — anchor stops, WCAG contrast badges, copy-format serialization.

### React island (`src/components/ShadeTool.tsx`)

Top-level `client:load` island. Owns hex, view mode (ramp vs scale), ramp mode (oklch vs classic), and copy/export format preferences. **Preference precedence is URL > localStorage > server-default**, layered to avoid hydration mismatches: initial render uses what the server saw, then post-hydration localStorage is read; if it disagrees with the URL the URL wins.

The Tailwind scale view, its export panel, and all five export-format serializers (`src/lib/exports/`) are lazy-loaded via `React.lazy` + `Suspense`. The Suspense fallback reserves roughly the same height as the rendered scale to avoid CLS on view-switch. Only the continuous-ramp path is shipped on initial load.

Both views' "Download PNG" button renders the palette client-side to a canvas via `src/lib/exports/ramp-png.ts`, which is dynamically `import()`-ed inside the click handler so the canvas code stays out of the eager ramp chunk. Keep `ramp-png.ts` free of static imports from any eager-path module. The drawing function takes a plain `Shade[]` (the ramp and the 11-stop Tailwind scale both feed it; scale shades render their stop label too). The `variant` option only tags the download filename (`uishades-<hex>-<oklch|classic|scale>.png`).

`ShadeTool.tsx` imports `findByHexSlim` from `named-colors-slim.ts` (not the full `named-colors.ts`) so the React island doesn't drag the blurb-bearing data set into its bundle. The full module is consumed only by `src/pages/colors/[name].astro` at build time. Respect this split when adding consumers.

### Data sources (`src/lib/data/`)

- `named-colors.ts` — full ~209-entry list with blurbs, aliases, related slugs. Build-time only.
- `named-colors-slim.ts` — hex-lookup-only subset for the React island.
- `popular-hexes.ts` — 2131-entry hex list, sitemap-injected.

`README.md`'s perf-budget section flags that splitting blurbs from lookup keys is the right next step for shrinking initial-load JS. Touch this only deliberately — both files are imported from boundary code that depends on their exact shape.

### Security headers (`src/middleware.ts`)

Auto-discovered Astro middleware. Sets HSTS, X-CTO, X-Frame-Options, Referrer-Policy, Permissions-Policy, and CSP on every response (both SSR routes and pre-rendered pages). CSP currently keeps `'unsafe-inline'` on `script-src` for JSON-LD blocks and the home-page inline form-handler; the audit tracks tightening via nonces.

All inline JSON-LD blobs MUST go through `safeJsonForScript()` (`src/lib/safe-json.ts`) — it escapes `<`, `>`, `&`, U+2028, U+2029 so future user-derived fields can't break out of the inline `<script>` block. Already wired in `index.astro`, `[hex].astro`, `colors/[name].astro`.

### Deploy

Pushes to `main` trigger `.github/workflows/deploy.yml` → Cloudflare Pages (project `uishades`). CI (`ci.yml`) runs build + Vitest + full Playwright matrix on every PR. Lighthouse CI (`lhci.yml`) runs separately.

## Conventions worth knowing

- `Hex` is canonical `#rrggbb` (lowercase, 7 chars, always with hash) anywhere in the type system. `parseColor` is the only entry point for raw user input.
- Pre-rendered named-color pages can't see search params at build time — `?view=scale` deep links briefly show the ramp before swapping on hydration. This is intentional; opting these pages out of pre-rendering would lose the SEO win.
- The `label-content-name-mismatch` Axe finding on shade rows is intentional and informative-only (badges are aria-hidden so the row's accessible name reads as one coherent contrast summary). Don't "fix" it.
- ShadeTool's "current hex" is URL-synced via `history.replaceState`. On the dev page (`/dev/tool`) it updates `?c=` instead so refresh doesn't drop the user onto the real route.
