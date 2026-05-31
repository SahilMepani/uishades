# Color Picker — Per-Channel Gradient Sliders

**Date:** 2026-05-31
**Status:** Approved (design), pending implementation plan

## Goal

Add three gradient channel sliders to the color picker popover. When the active
format is **RGB**, **HSL**, or **OKLCH**, show one draggable slider per channel
(R/G/B, H/S/L, L/C/H). Each slider's track is painted with the gradient of that
channel (the other two held fixed), with a thumb at the current value. Dragging a
slider changes the color, and the change is reflected in the single existing text
value input.

Sliders are **hidden for the HEX format** (HEX keeps only the text input).

The existing controls all stay: react-colorful's saturation square + hue strip,
the format dropdown, the text value input, the eyedropper, and the onboarding
hint. The sliders are an *addition*.

## Non-goals

- No change to the format dropdown, auto-detection, or paste handling.
- No new copy/export formats; this is picker-input only.
- No replacement of react-colorful's square/hue strip.
- No alpha channel.

## Approach

**Approach A (chosen): native `<input type="range">` per channel**, with a
gradient-painted track and a custom thumb styled to match the picker's hairline
language. Rationale:

- Keyboard arrows, focus, and ARIA come for free — this repo runs Axe a11y
  checks in Playwright, so accessible-by-default matters.
- Minimal JS; integrates with the existing react-colorful CSS-override pattern in
  `global.css`.

Rejected: a custom pointer-event slider (reimplements drag + manual ARIA), and
swapping in react-colorful's `RgbColorPicker` (no labeled per-channel sliders for
HSL/OKLCH, would duplicate the square).

## Architecture

### New module: `src/lib/color/channels.ts`

Keeps the channel math testable (consistent with the rest of `src/lib/color/`)
and keeps `ColorPicker.tsx` (already ~520 lines) lean.

```ts
export type ChannelFormat = 'rgb' | 'hsl' | 'oklch';

export interface ChannelDef {
  key: string;    // 'r' | 'g' | 'b' | 'h' | 's' | 'l' | 'c'
  label: string;  // 'R', 'G', 'B', 'H', 'S', 'L', 'C'
  min: number;
  max: number;
  step: number;
  hue?: boolean;  // hue channels need many gradient stops
}

export const CHANNEL_DEFS: Record<ChannelFormat, ChannelDef[]>;
```

Channel ranges and steps:

| Format | Channels | Range | Step |
|--------|----------|-------|------|
| rgb    | R, G, B  | 0–255 | 1 |
| hsl    | H        | 0–360 | 1 (hue) |
|        | S, L     | 0–100 | 1 |
| oklch  | L        | 0–1   | 0.001 |
|        | C        | 0–0.4 | 0.001 |
|        | H        | 0–360 | 1 (hue) |

Functions:

- `decompose(hex: Hex, fmt: ChannelFormat): number[]`
  - Uses culori converters (`rgb` / `hsl` / `oklch`) via the existing
    `parse.ts` helpers. RGB channels scaled to 0–255 and rounded. HSL S/L scaled
    to 0–100. OKLCH kept in native units (L 0–1, C 0–0.4, H 0–360).
  - For achromatic inputs where hue is `NaN`, hue is reported as `0` so the
    slider has a concrete position. (The tuple-state guard below preserves a
    *chosen* hue across a drag; only a fresh decompose collapses NaN→0.)

- `recompose(values: number[], fmt: ChannelFormat): Hex`
  - Builds the `fn(...)` string (`rgb(r g b)`, `hsl(h s% l%)`, `oklch(l c h)`)
    and runs it through `parseColor`, reusing its sRGB gamut mapping. Returns
    canonical `#rrggbb`.

- `channelGradient(values: number[], fmt: ChannelFormat, index: number): string`
  - Returns a `linear-gradient(to right, …)` CSS value. Built by **sampling**
    the channel from `min`→`max` (others held fixed) at N evenly spaced points
    and converting each sample to hex via `recompose`. N is larger for hue
    channels (e.g. ~24) than for the others (e.g. ~10). Sampling — rather than
    relying on the browser's gradient color-space interpolation — guarantees the
    track is accurate and gamut-correct identically across all three formats.

### Changes to `src/components/ColorPicker.tsx`

1. **Channel tuple state** as the slider source of truth:
   ```ts
   const [channels, setChannels] = useState<number[]>(() =>
     isChannelFmt(channelFormat) ? decompose(hex, channelFormat) : []);
   ```
   `isChannelFmt` returns true for rgb/hsl/oklch (false for hex).

2. **External re-sync effect**, mirroring the existing `channelText` guard at
   `ColorPicker.tsx:310`:
   ```ts
   useEffect(() => {
     if (!isChannelFmt(channelFormat)) return;
     const derivedHex = recompose(channels, channelFormat);
     if (derivedHex !== hex) setChannels(decompose(hex, channelFormat));
   }, [hex, channelFormat]); // eslint-disable-line react-hooks/exhaustive-deps
   ```
   This re-derives the tuple when hex changes from the square, the text input, or
   the eyedropper, but leaves it untouched when the slider itself produced the
   current hex. This is what lets OKLCH hue survive while chroma is 0 (the chosen
   hue is held in the tuple even though the hex is grey), and avoids round-trip
   drift during a drag.

3. **Slider change handler**:
   ```ts
   function handleChannelSlider(index: number, value: number) {
     const next = channels.slice();
     next[index] = value;
     setChannels(next);
     try { onChange(recompose(next, channelFormat)); } catch { /* ignore */ }
   }
   ```
   The parent's hex update flows back through props; the **existing**
   `[hex, channelFormat]` effect (`ColorPicker.tsx:310`) reformats `channelText`,
   so the text input reflects the slider with no extra wiring.

4. **Render**: when `isChannelFmt(channelFormat)`, render a `<div>` of three
   sliders below the text-input row (inside the popover, before/around the hint).
   Each slider:
   - wrapper with the channel `label` (e.g. `R`),
   - `<input type="range">` with `min`/`max`/`step` from `CHANNEL_DEFS`, `value`
     from the tuple, `aria-label` like `"Red channel"` /
     `"OKLCH lightness channel"`,
     and an inline `style={{ background: channelGradient(...) }}` on the track,
   - `onChange` → `handleChannelSlider(index, Number(e.target.value))`.
   Hidden entirely when `channelFormat === 'hex'`.

### Styling

Add range-input rules to `src/styles/global.css` alongside the existing
`.react-colorful` overrides. Target a class (e.g. `.channel-slider`) so the rules
don't leak to other range inputs:

- Track: full-width, ~12px tall (matching the hue strip), `background` set inline
  per channel; remove default appearance.
- Thumb: circular, white fill with a hairline ring, matching
  `.react-colorful__pointer` (16px, 2px border) — styled for both
  `::-webkit-slider-thumb` and `::-moz-range-thumb`.
- Focus-visible ring consistent with the rest of the picker.

Cross-browser: rules cover WebKit and Firefox pseudo-elements; the Playwright
matrix (chromium/firefox/webkit) exercises all three.

## Data flow summary

```
slider drag → handleChannelSlider → setChannels(tuple) + onChange(recompose)
            → parent hex prop updates
            → [hex] effect reformats channelText (text input reflects value)
            → [hex] re-sync effect: recompose(tuple)===hex, so tuple is kept

square / text / eyedropper change → parent hex updates
            → re-sync effect: recompose(tuple)!==hex → setChannels(decompose(hex))
            → sliders snap to the new color
```

## Testing

- **Unit (`src/lib/color/channels.spec.ts`)**:
  - `decompose`→`recompose` round-trips for representative colors in each format
    (within rounding tolerance; RGB exact).
  - Achromatic input: hue reported as 0, recompose stays grey.
  - `channelGradient` returns a `linear-gradient(...)` with the expected number
    of `#rrggbb` stops and correct endpoint colors; hue channels get more stops.
  - OKLCH out-of-gamut sample (e.g. high C) is gamut-mapped to a valid hex.
- **E2E**: extend the existing `tests/e2e/tool.spec.ts` picker coverage —
  open the picker, select RGB, confirm three sliders appear; move a slider and
  assert the text value input updates; switch to HEX and confirm sliders are
  gone.

## Open questions / assumptions

- OKLCH L slider uses native units (0–1, step 0.001) rather than a 0–100%
  display. The text input already shows coarse OKLCH; the slider is for fine
  control. (Can switch to % later if desired.)
- Gradient stop counts (~10 / ~24 for hue) are starting values, tunable for
  smoothness vs. cost during implementation.
