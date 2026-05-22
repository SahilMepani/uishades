# shades.dev

A free, fast, ad-free shade generator. Mirrors the URL structure of
`0to255.com` (`/[hex]`, `/colors/[name]`) and ships an OKLCH-based algorithm
for visibly cleaner shades, with Tailwind / design-token exports.

## Local development

```sh
npm install
npm run dev
```

Dev server runs at <http://localhost:4321>.

## Build

```sh
npm run build
```

Outputs the static site + Cloudflare Pages adapter bundle to `dist/`.

## Test

```sh
npm test          # Vitest unit tests (color math, parsers)
npm run test:e2e  # Playwright end-to-end tests (Chromium, Firefox, WebKit, mobile-chrome)
```

`npm run test:watch` runs Vitest in watch mode.

End-to-end coverage includes:
- `tool.spec.ts` — shade-tool smoke flows (ramp render, copy-to-clipboard, view switch, export dropdown, color input)
- `a11y.spec.ts` — `@axe-core/playwright` scan on home, named-color page, and dev tool route. Zero serious/critical violations expected.
- `keyboard.spec.ts` — Tab order, ArrowUp/Down shade-row cycling, Enter-to-copy, Escape on autocomplete, focus rings
- `mobile.spec.ts` — sticky header pinning, tap-target sizes, no horizontal overflow (runs only under the `mobile-chrome` Pixel-5 viewport project)

## Lighthouse

```sh
npm run lhci      # Lighthouse CI against the three audited routes
```

## Performance

### Measured Lighthouse scores (production build, desktop preset, May 2026)

| Route               | Performance | Accessibility | Best Practices | SEO |
|---------------------|------------:|--------------:|---------------:|----:|
| `/`                 |         100 |           100 |            100 | 100 |
| `/4040ff`           |         100 |           100 |            100 | 100 |
| `/colors/coral`     |         100 |           100 |            100 | 100 |

`label-content-name-mismatch` shows as an Axe finding on the shade-tool
pages — the contrast badges' visible text (`AA`, `AAA`, `–`) is
intentionally aria-hidden so screen readers get a single, well-formed
contrast summary instead of two repeated tokens per row. Lighthouse
classifies the rule as informative; the category score is 100.

### Bundle sizes (Brotli q=11, production build)

| Chunk                          | Raw     | Gzip    | Brotli  | Loaded |
|--------------------------------|--------:|--------:|--------:|--------|
| `client.*.js` (React runtime)  | 186 KB  | 58 KB   | 51 KB   | initial |
| `ShadeTool.*.js`               | 242 KB  | 66 KB   | 53 KB   | initial |
| `index.*.js` (page shell)      |   7.7 KB|  2.9 KB |  2.6 KB | initial |
| **Initial load total**         | 436 KB  | **128 KB** | **106 KB** | |
| `TailwindScale.*.js`           |  4.1 KB |  1.5 KB |  1.3 KB | lazy (on view switch) |

The Tailwind scale view + its five export-format serializers are lazy-loaded
via `React.lazy` + `Suspense`; the initial paint only ships the continuous
ramp code path. A height-stable Suspense fallback prevents CLS on
view-switch.

### Performance budget

The plan called for "React island ≤ 30 KB Brotli". That number was set
before measuring React 19 + ReactDOM 19, which together compress to ~50 KB
Brotli — alone. The honest budget for this codebase, accounting for
React + the lazy-loaded Tailwind path being separately chunked:

- **Initial-load JS (React + ShadeTool main + page shell): ≤ 110 KB Brotli.**
  Measured: 106 KB. The bulk is `ShadeTool.*.js` which embeds the
  `POPULAR_HEXES` + `NAMED_COLORS` data sources (used by `ColorInput`'s
  random + autocomplete features). Both are imports in `src/lib/data/`
  which the wave-3a charter forbade modifying; data-driven shrinkage is
  the right next step (split blurbs from lookup; only ship lookup keys
  on initial load).
- **Lazy-load chunks: ≤ 10 KB Brotli per chunk.** Measured: 1.3 KB.

CI does not currently fail on bundle-size regressions — adding a
`size-limit` step on top of these numbers is a TODO for the next pass.

### Known limitations

- **Per-shade `label-content-name-mismatch` axe finding** (described above)
  is informative-only and intentional.
- **Pre-rendered named-color pages with `?view=scale` deep links**
  briefly show the ramp view before swapping to the scale on hydration.
  `Astro.url` has no search params at build time for these pages, so the
  SSR HTML always uses the default view. The canonical entry point for
  `/colors/[name]` has no query string, so this case only affects users
  who explicitly share `/colors/coral?view=scale`. Opting these pages out
  of pre-rendering would close the gap at the cost of the named-color
  SEO win (a hot-path edge cache hit, vs. building 209 HTML files at
  CI time).
- **Lighthouse on Windows** intermittently logs
  `EPERM: Permission denied` during Chrome temp-dir cleanup after a
  successful audit. The JSON output is written first, so scores are
  captured; the noise is cosmetic on this platform.
- **`@astrojs/sitemap` filter** excludes `/dev/*`. The dev tool page
  already carries `<meta name="robots" content="noindex,nofollow">`; the
  filter is a belt-and-braces measure so we never send the URL as a
  discovery signal.

## Accessibility

The plan's 100% Lighthouse-accessibility target is met on all three
audited routes (see scores above). The Axe E2E scan in
`tests/e2e/a11y.spec.ts` runs on every PR and fails the build on any
serious or critical violation.

Specific behaviours documented in the source comments:

- Shade rows have a role=button, tabindex=0, and an accessible name that
  matches WCAG 2.5.3 (Label in Name) — visible hex / stop / "input"
  tokens come first, followed by a screen-reader summary of the
  contrast badges (so badges can be aria-hidden without dropping
  information).
- Keyboard: ArrowUp/Down cycles between sibling shade rows, Enter
  copies, Shift+Enter navigates, Escape closes the autocomplete listbox.
- `prefers-reduced-motion` honoured throughout — every transition class
  is `motion-safe:transition-*` or wrapped in `@media (prefers-reduced-motion: reduce) { ... }`.
- `prefers-color-scheme: dark` updates the page chrome (background,
  link color, borders) on `/`, `/[hex]`, and `/colors/[name]`. The shade
  swatches and ramps are never inverted — they're the colour content.
- All shade-row tap targets are ≥ 44×44 CSS px (tested in
  `tests/e2e/mobile.spec.ts`).

## Security

Middleware (`src/middleware.ts`) decorates every response with HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy, and CSP. The CSP keeps `'unsafe-inline'` for the JSON-LD blocks and the home-page inline form-handler script; audit Tier 2.4 tracks tightening via nonces.

All inline JSON-LD payloads pass through `safeJsonForScript()` (`src/lib/safe-json.ts`), which escapes `<`, `>`, `&`, U+2028, and U+2029 so future user-derived fields can't break out of the inline `<script>` block. Wired in `src/pages/index.astro`, `src/pages/[hex].astro`, and `src/pages/colors/[name].astro`.

## Deploy

Deployment is automatic: pushes to `main` trigger the
`.github/workflows/deploy.yml` workflow, which builds and ships to
Cloudflare Pages (project `shades-dev`).

Required repository secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

See `.env.example` for the full list.

## Plan

The full implementation plan lives at
`C:\Users\SAHIL\.claude\plans\do-you-know-https-0to255-com-harmonic-mountain.md`.
