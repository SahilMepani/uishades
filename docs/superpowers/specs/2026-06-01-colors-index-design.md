# `/colors` — Named-Color Index Page

**Date:** 2026-06-01
**Status:** Approved design, ready for implementation plan

## Goal

Add a browsable index page at `/colors` that lists every entry in
`NAMED_COLORS` (~209 colors), grouped by color family, each linking to its
existing `/colors/[name]` detail page. Today no `/colors` index exists — the
footer "Named colors" link points at the arbitrary `/colors/coral` page.

## Constraints / context

- `NAMED_COLORS` (`src/lib/data/named-colors.ts`) is the full build-time data
  set: `{ slug, name, hex, family, ... }`. The `family` field is a
  `ColorFamily` union: `red | orange | yellow | green | teal | blue | indigo |
  purple | pink | brown | gray | neutral`.
- The full `named-colors.ts` module is **build-time only** (see CLAUDE.md). A
  pre-rendered `.astro` page may import it directly — this page does, exactly
  like `/colors/[name].astro` does.
- All inline JSON-LD must go through `safeJsonForScript()`
  (`src/lib/safe-json.ts`) per CLAUDE.md.

## Decisions (from brainstorming)

- **Organization:** grouped by color family, with a semantic `<h2>` per family.
- **Interactivity:** fully static, server-rendered, no React island / no JS.
  Users rely on browser find (Ctrl+F). This keeps the page fully indexable and
  zero-bundle.

## Design

### Route

New file: `src/pages/colors/index.astro`.

- Pre-rendered / static — **no** `export const prerender = false`. Same
  rendering class as `/colors/[name].astro`. Astro auto-includes static pages
  in the sitemap, so no `customPages` change is needed.

### Page shell

Reuse the established chrome (matches `src/pages/explore/index.astro` and the
named-color detail pages):

- `BaseHead`, then page-specific `<title>` / meta / canonical / OG / twitter.
- Header strip: "UI Shades" wordmark link → `/`, then `Explore` (`/explore`),
  `My palettes` (`/me/palettes`), `HeaderAuth` (`client:load`), `ThemeToggle`.
- Footer nav matching the other pages.
- Design tokens only: `bg-paper`, `text-ink`, `text-ink-2`, `border-hairline`,
  `kicker`, `display`, `font-mono`. No new CSS primitives.

### Content

Page header block: a `kicker` ("Named colors"), an `<h1>` ("All named
colors"), and a one-line `<p>` intro.

Then one `<section>` per family, in spectrum order:

```
red, orange, yellow, green, teal, blue, indigo, purple, pink, brown, gray, neutral
```

Each section:

- `<h2>` with the family label (Title Case, e.g. "Blue", "Gray").
- A responsive grid (Tailwind grid, e.g. 2 cols mobile → 4–6 cols desktop) of
  color cards. Each card is:
  - `<a href="/colors/{slug}">` (the whole card is the link).
  - A swatch block with inline `style={`background:${hex}`}`.
  - The display `name`.
  - The `hex` in `font-mono`, lowercase (`Hex` is already canonical
    `#rrggbb`).
- Cards within a family sorted alphabetically by `name`.

Grouping is computed at build time: iterate `NAMED_COLORS`, bucket by `.family`,
sort each bucket by `name`, render families in the fixed spectrum order. Skip a
family section if it has zero entries (defensive; all families currently
populated).

### SEO

- `<title>`: "All Named Colors | UI Shades"
- `description`: covers the ~209 CSS / Tailwind / Material / Bootstrap named
  colors with OKLCH shade ramps and Tailwind/token exports, free & ad-free.
- `canonical`: `https://UIshades.com/colors`
- OG / twitter tags, reusing the existing `https://UIshades.com/og/4040ff.png`
  image (same approach as `explore/index.astro`).
- JSON-LD via `safeJsonForScript()`:
  - `BreadcrumbList`: Home → Named colors.
  - `CollectionPage` describing the index.

### Wiring: footer links

Repoint the "Named colors" footer link from `/colors/coral` → `/colors` in all
four current locations:

- `src/layouts/ColorToolLayout.astro:130`
- `src/pages/explore/index.astro:98`
- `src/pages/me/palettes/index.astro:53`
- `src/pages/p/[slug].astro:234`

(The `/colors/coral` mention in `src/components/ShadeTool.tsx` is a code comment,
not a link — leave it.)

## Testing

- **Build:** `npm run build` emits `dist/colors/index.html`.
- **Playwright e2e** (add to the existing suite): navigate to `/colors` on the
  preview build and assert:
  - The `<h1>` "All named colors" is present.
  - All twelve family `<h2>` headings render.
  - A known color (e.g. "Coral") card links to `/colors/coral`.
  - Clicking a card navigates to the detail page.

## Out of scope (YAGNI)

- No search/filter island.
- No pagination (209 links is fine on one page).
- No per-family detail pages or family landing routes.
- No changes to `named-colors.ts` data or the slim split.
