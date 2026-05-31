# Auto-suggested palette names

## Problem

When a signed-in user clicks **Save palette**, the name field defaults to the
active color's exact named-color name, falling back to the literal string
`"Untitled palette"`. Because the lookup (`findByHexSlim`) is an *exact* hex
match against 209 named colors, the fallback fires for almost every real
palette, and it ignores the other colors in the tray entirely. Users see an
unhelpful "Untitled palette" suggestion.

## Goal

Suggest a descriptive, evocative name derived from **all** the colors in the
palette tray, shown as the name input's **placeholder** (ghost text). The user
can type to override; an empty field saves with the suggested name.

## New module: `src/lib/color/palette-name.ts`

Pure, deterministic, unit-tested — matches the codebase convention of color
math living in `src/lib/color/` with Vitest coverage.

```ts
export function suggestPaletteName(hexes: Hex[]): string
```

Converts each hex to OKLCH via the existing `toOklch`, then aggregates:

1. **Neutral detection** — chroma-weighted average chroma below the shared
   `ACHROMATIC_CHROMA` threshold (`0.03`, reused from `hue.ts`) ⇒ theme
   `"Neutrals"`.
2. **Dominant hue** — chroma-weighted circular mean of the chromatic colors'
   hues (gray swatches contribute ~0 weight so they don't skew it), mapped to
   an evocative theme noun:

   | hue band (OKLCH°)        | theme      |
   |--------------------------|------------|
   | reds / oranges           | `Sunset`   |
   | yellows                  | `Citrus`   |
   | greens                   | `Forest`   |
   | teal / cyan              | `Lagoon`   |
   | blues                    | `Ocean`    |
   | purples / violets        | `Twilight` |
   | pinks / magentas         | `Blossom`  |

3. **Very mixed** — when the chroma-weighted hue spread spans most of the wheel
   ⇒ theme `"Spectrum"` (kept evocative per the chosen vocabulary).
4. **Tone modifier** (first word) from average lightness, then chroma:
   `Pale` / `Light` (high L), `Deep` / `Dark` (low L); for mid L,
   `Vibrant` (high C) / `Muted` (low C) / `Soft` (between).

Result = `"{Tone} {Theme}"` — e.g. `"Deep Ocean"`, `"Soft Blossom"`,
`"Light Neutrals"`, `"Vibrant Spectrum"`. Empty input returns `""` (the caller
substitutes its own fallback).

## Wiring in `ShadeTool.tsx`

- `defaultPaletteName` memo:
  - tray has a single color that is an **exact** named-color match → keep its
    friendly name (preserves today's nice `"Royal Blue"` behavior),
  - otherwise → `suggestPaletteName(tray.map(c => c.hex))`,
  - empty tray → `"Untitled palette"`.
- In the tray-builder naming UI:
  - `beginNaming` no longer pre-fills the value; it leaves the input empty and
    focuses it.
  - the input's `placeholder` becomes `defaultName` (the suggestion) instead of
    the hardcoded `"Untitled palette"`.
  - `submit` saves `name.trim()` if non-empty, otherwise `defaultName`.

## Non-goals (YAGNI)

- No de-duplication against the user's existing palette names — it's a starting
  suggestion; collisions are harmless (unique IDs, renamable in the editor).
- No changes to the save API or `PaletteEditor`.

## Testing

Vitest unit tests for `suggestPaletteName`: warm reds → Sunset, blues → Ocean,
dark blue → "Deep Ocean", light grays → neutral tone, mixed wheel → Spectrum,
single color, empty → "". Deterministic, so exact-string assertions.
