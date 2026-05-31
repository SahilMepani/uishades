# Automatic family name from nearest named color

**Date:** 2026-06-01
**Status:** Approved (brainstorm)

## Problem

Export serializers prefix every token with a family name: `--color-{name}-500`,
`{name}-950`, etc. Today `ShadeTool` derives that name as:

```ts
const brandName = named?.slug ?? 'brand';
```

`named` comes from `findByHexSlim(hex)`, which is an **exact** hex match against
the 209-entry `NAMED_COLORS_SLIM` list. Any color that is not an exact match —
i.e. almost every color a user picks — falls back to the generic `'brand'`, so
exports read `--color-brand-50`. The user wants the prefix to always be a real,
recognizable color name, generated **automatically** (no UI input).

## Decision

When the input hex is not an exact named match, derive the family name from the
**nearest** named color by perceptual OKLCH distance. So `#4040ff` exports as
`--color-royal-blue-50` rather than `--color-brand-50`.

This was chosen over an evocative generated name (`deep-ocean`) and a simple hue
descriptor (`dark-blue`) because nearest-named yields the most recognizable,
literal color names and reuses the existing curated slug set.

## Design

### 1. New lookup: `nearestNamedSlug(hex)`

New file `src/lib/data/nearest-named.ts`. Pure, deterministic, island-side.

- Imports `NAMED_COLORS_SLIM` (the slim list — preserves the slim/full data
  split documented in CLAUDE.md) and `toOklch` from `src/lib/color/parse`.
- At module load, precompute each slim entry's OKLab coordinates once:
  `L = oklch.l`, `a = c·cos(h)`, `b = c·sin(h)` (achromatic entries where `h`
  is `NaN` use `a = b = 0`). Store alongside the slug.
- `nearestNamedSlug(hex: Hex): string` converts the input hex to OKLab the same
  way, then returns the slug with the smallest Euclidean distance in `(L, a, b)`
  (ΔEOK). 209 comparisons per call — trivial; callers memoize per-hex.
- Defensive fallback `'brand'` only if the list is somehow empty (never in
  practice; the 209 entries blanket the wheel).

### 2. Wire into `ShadeTool`

Single-line change at `src/components/ShadeTool.tsx:442`:

```ts
const brandName = named?.slug ?? nearestNamedSlug(hex);
```

Memoize with the existing `named`/`ramp`/`scale` `useMemo`s keyed on `hex`.

- `named` (exact-match) is **unchanged** — the friendly label shown under the
  input (e.g. "Royal Blue") still appears only for genuine exact matches, so an
  arbitrary color is never mislabeled as a named one.
- `brandName` already flows to both views (`TailwindScale` and `ContinuousRamp`
  → `ExportDropdown`), so all five serializers and the modal header
  (`Export {name} scale`) pick this up with no further component changes.
- Serializers' existing `sanitizeName()` keeps the slug CSS-safe
  (`royal-blue` → `royal-blue`).

### 3. Testing

New Vitest file `tests/nearest-named.spec.ts` (or co-located with existing color
tests):

- Exact hex (`#4169e1`) returns its own slug (`royal-blue`).
- A hex a few units off `royal-blue` still returns `royal-blue`.
- Pure black / white map to `black` / `white`.
- A mid gray maps to a gray-family slug (`gray`/`grey`/`dimgray`-style entry).

No e2e change required.

## Out of scope / unchanged

- PNG export filenames (use the source hex, not the name).
- `suggestPaletteName` (the Save-palette dialog flow).
- The exact-match input label and the `findByHexSlim` contract.
- No user-editable name field — explicitly rejected.
