# OKLCH index-based export — design

**Date:** 2026-06-01
**Status:** Approved (pending spec review)

## Problem

The shade tool has two views: the default **Tailwind** 11-stop scale (`view: 'scale'`)
and the **OKLCH** 20-step continuous ramp (`view: 'ramp'`). The Tailwind view offers a
structured text **export dropdown** (Tailwind v4/v3, CSS variables, W3C tokens, Figma
variables); the OKLCH view offers only per-row copy and a Download-PNG button.

The reason the OKLCH view has no export is structural: every serializer in
`src/lib/exports/` takes a `TailwindScale` and keys its output off `s.stop` (the named
50…950 stops). The OKLCH ramp's 20 steps carry no stop labels, so the existing
serializers cannot consume it.

## Goal

Give the OKLCH ramp view its own export dropdown, with tokens named by **plain step
index `1`–`20`** (lightest = 1), reusing the same five export formats and the same
export panel UI as the Tailwind view.

## Decisions

| Decision | Choice |
| --- | --- |
| Token naming scheme | Plain step index `1`–`20`, lightest first (no zero-padding) |
| Color value | **hex / oklch() toggle** in the export panel |
| Formats offered | All 5 |
| Toggle ↔ JSON formats | CSS-family (tw-v4, tw-v3, css-vars) follow the toggle; **Figma + W3C always emit hex** |
| Format preference | **Shared** with the Tailwind view (`shades.exportFormat`, `?fmt=`) |
| Value-mode preference | New `shades.oklchValueMode`, localStorage-only (no URL param) |
| Default value mode | `oklch` |
| Serializer architecture | Shared normalized token-list (refactor the 5 serializers), not parallel duplicates |

## Architecture

### 1. Normalized token list — `src/lib/exports/tokens.ts` (new)

A single shared module both views feed:

```ts
import type { Hex, OKLCH, TailwindScale, ContinuousRamp } from '../color/types';

export interface ColorToken {
  key: string;   // token suffix: '50'..'950' for the scale, '1'..'20' for the ramp
  hex: Hex;
  oklch: OKLCH;
}

export type ValueMode = 'hex' | 'oklch';

/** Moved here from the 5 serializers (deletes 5 copy-pasted definitions). */
export function sanitizeName(name: string): string;

/** Tailwind scale → tokens keyed by stop number. */
export function scaleToTokens(scale: TailwindScale): ColorToken[];

/** OKLCH ramp → tokens keyed by 1-based step index, lightest first. */
export function rampToTokens(ramp: ContinuousRamp): ColorToken[];

/**
 * Render a token's value. 'hex' → t.hex; 'oklch' → formatForCopy(t.hex, 'oklch').
 * We derive the oklch() string from the *rendered* hex (the same value the
 * per-row "copy as OKLCH" uses) rather than the ramp's pre-clamp target OKLCH,
 * so exports never emit out-of-gamut values and stay consistent with row copy.
 */
export function tokenValue(t: ColorToken, mode: ValueMode): string;
```

`rampToTokens` maps `ramp.shades[i]` → `{ key: String(i + 1), hex, oklch }`. The ramp is
already ordered lightest→darkest (`ramp.ts`), so index 1 = lightest, index 20 = darkest.

### 2. Refactor the 5 serializers

Change each from `(scale: TailwindScale, name: string)` to
`(tokens: ColorToken[], name: string, valueMode: ValueMode)`:

- `tailwind-v4.ts` — `--color-{slug}-{t.key}: {tokenValue(t, mode)};`
- `tailwind-v3.ts` — `'{t.key}': '{tokenValue(t, mode)}',`
- `css-vars.ts` — `--{slug}-{t.key}: {tokenValue(t, mode)};`
- `w3c-tokens.ts` — **ignores `valueMode`, always hex.** `inner[t.key] = { $value: t.hex, $type: 'color' }`
- `figma-vars.ts` — **ignores `valueMode`, always hex.** variable value = `t.hex`

Each serializer drops its local `sanitizeName` and imports the shared one.

The "JSON stays hex" rule lives explicitly inside `w3c-tokens.ts` and `figma-vars.ts`
(documented in-file), so it holds no matter which caller passes which mode.

### 3. UI — `ExportDropdown.tsx`

Generalize its props:

```ts
export interface ExportDropdownProps {
  tokens: ColorToken[];          // was: scale: TailwindScale
  format: ExportFormat;
  brandName?: string;
  valueMode: ValueMode;          // new
  onValueModeChange: (m: ValueMode) => void;  // new
  showValueToggle: boolean;      // new — true only for the OKLCH view
  onFormatChange: (next: ExportFormat) => void;
  onCopy: (text: string) => void;
}
```

- `serialize()` switches on format and calls the serializer with `(tokens, name, valueMode)`.
- When `showValueToggle` is true, render a small `[ Hex | OKLCH ]` segmented control next to
  the "Export as" label (and in the modal header). The Tailwind view passes
  `showValueToggle={false}` and `valueMode="hex"`, so its panel is visually unchanged and
  its output stays byte-identical.
- The modal (`ExportModal`) takes `tokens` + `valueMode` instead of `scale`.

### 4. UI — `ContinuousRamp.tsx`

Mirror `TailwindScale`: render an `ExportDropdown` (behind the same `React.lazy` +
`Suspense` boundary, so both views share one lazily-loaded export chunk) above the rows.
New props threaded in: `exportFormat`, `onExportFormatChange`, `valueMode`,
`onValueModeChange`, `onExportCopy`, `brandName`. Build tokens with `rampToTokens(ramp)`.

### 5. State — `ShadeTool.tsx`

- Add `const [oklchValueMode, setOklchValueMode] = usePersistedState<ValueMode>(`
  `STORAGE_KEYS.oklchValueMode, ['hex','oklch'], 'oklch', null)` — localStorage-only
  (`urlParam = null`), default `'oklch'`.
- Add `oklchValueMode: 'shades.oklchValueMode'` to `STORAGE_KEYS`.
- The ramp branch passes the **shared** `exportFormat`/`setExportFormat` (same state the
  Tailwind view uses) plus `oklchValueMode`/`setOklchValueMode` into `ContinuousRamp`.
- The Tailwind `TailwindScale` callsite is updated to pass `tokens={scaleToTokens(scale)}`,
  `valueMode="hex"`, `showValueToggle={false}` to the now-generalized `ExportDropdown`.

## Data flow

```
ShadeTool (owns hex, view, exportFormat, oklchValueMode)
  ├─ view==='scale' → TailwindScale → ExportDropdown(scaleToTokens(scale), 'hex', toggle off)
  └─ view==='ramp'  → ContinuousRamp → ExportDropdown(rampToTokens(ramp), oklchValueMode, toggle on)
                                          └─ serialize → tokens.ts tokenValue() per format
```

## Error handling / edge cases

- Clipboard unavailable: existing `clipboardAvailable()` guard + toast, unchanged.
- Achromatic input: `oklch.h` is `NaN`; `formatForCopy(hex,'oklch')` already handles this
  (it derives from the hex), so the oklch() string is well-formed.
- Brand name sanitization: shared `sanitizeName`, behavior identical to today.

## Testing

**Unit (`tests/`):**
- `rampToTokens`: 20 tokens, keys `'1'`..`'20'`, lightest first.
- `tokenValue`: hex passthrough; oklch mode emits `oklch(` derived from hex.
- Each CSS-family serializer under `valueMode:'oklch'` emits oklch() values.
- `w3c-tokens` + `figma-vars` emit hex even when passed `valueMode:'oklch'`.
- Regression: Tailwind serializer outputs are byte-identical to the pre-refactor strings
  (snapshot the current output first).

**E2E (`tests/e2e/tool.spec.ts`):**
- Switch to OKLCH view → export dropdown and `[ Hex | OKLCH ]` toggle present.
- Copy a CSS-family format → clipboard contains `oklch(`.
- Toggle to Hex → copy → clipboard contains `#`.

## Out of scope

- PNG export — already works for the ramp (`DownloadPngButton variant={ramp.mode}`), untouched.
- `?view=` / `?fmt=` URL contracts — unchanged.
- The classic ramp (retired from UI).
- Any change to the Tailwind view's behavior or output.
