# OKLCH Index-Based Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the OKLCH ramp view its own export dropdown — same five formats as the Tailwind view, tokens named by plain step index `1`–`20`, with a hex/oklch() value toggle.

**Architecture:** Introduce one shared `tokens.ts` module that normalizes both the Tailwind scale and the OKLCH ramp into a `ColorToken[]` (`{ key, hex, oklch }`). Refactor all five serializers to consume `(tokens, name, valueMode)` instead of `(scale, name)`, deleting five copy-pasted `sanitizeName` definitions. Generalize `ExportDropdown` to take `tokens` + an optional hex/oklch toggle, then mount it inside `ContinuousRamp` exactly as `TailwindScale` already does. The Tailwind view's output stays byte-identical.

**Tech Stack:** Astro 6, React 19, TypeScript, Vitest (unit), Playwright (e2e), culori (color math via `formatForCopy`).

**Spec:** `docs/superpowers/specs/2026-06-01-oklch-index-export-design.md`

**Branch:** `feat/oklch-index-export` (already created; spec already committed)

---

## File Structure

**Create:**
- `src/lib/exports/tokens.ts` — `ColorToken`, `ValueMode`, `sanitizeName`, `scaleToTokens`, `rampToTokens`, `tokenValue`. The single shared normalization + naming layer.
- `tests/tokens.spec.ts` — unit tests for the new module.

**Modify (serializers — signature `(tokens, name, valueMode)`):**
- `src/lib/exports/tailwind-v4.ts`
- `src/lib/exports/tailwind-v3.ts`
- `src/lib/exports/css-vars.ts`
- `src/lib/exports/w3c-tokens.ts` (always hex)
- `src/lib/exports/figma-vars.ts` (always hex)

**Modify (UI):**
- `src/components/ExportDropdown.tsx` — props take `tokens` + value-mode toggle.
- `src/components/TailwindScale.tsx` — pass `tokens={scaleToTokens(scale)}`, `valueMode="hex"`, `showValueToggle={false}`.
- `src/components/ContinuousRamp.tsx` — mount a lazy `ExportDropdown` with `rampToTokens(ramp)`, toggle on.
- `src/components/ShadeTool.tsx` — add `oklchValueMode` state; thread export props into `ContinuousRamp`.

**Modify (tests):**
- `tests/exports.spec.ts` — update `toTailwindV3` callsite to the new signature.
- `tests/e2e/tool.spec.ts` — add OKLCH-view export coverage.

---

## Task 1: Create the shared token module

**Files:**
- Create: `src/lib/exports/tokens.ts`
- Test: `tests/tokens.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/tokens.spec.ts`:

```ts
/**
 * Shared export-token normalization.
 *
 * tokens.ts is the single layer that turns either palette shape (Tailwind
 * 11-stop scale, OKLCH 20-step ramp) into a flat ColorToken[] the five
 * serializers consume, plus the hex/oklch() value renderer.
 */
import { describe, it, expect } from 'vitest';
import { parseColor } from '../src/lib/color/parse';
import { buildScale } from '../src/lib/color/scale';
import { oklchRamp } from '../src/lib/color/ramp';
import {
  sanitizeName,
  scaleToTokens,
  rampToTokens,
  tokenValue,
} from '../src/lib/exports/tokens';

const hex = parseColor('#4040ff');

describe('sanitizeName', () => {
  it('lowercases, hyphenates, and trims to a slug', () => {
    expect(sanitizeName('Burnt Orange')).toBe('burnt-orange');
  });
  it('falls back to "brand" when nothing survives', () => {
    expect(sanitizeName('!!!')).toBe('brand');
    expect(sanitizeName('')).toBe('brand');
  });
});

describe('scaleToTokens', () => {
  it('keys tokens by Tailwind stop number', () => {
    const tokens = scaleToTokens(buildScale(hex));
    expect(tokens).toHaveLength(11);
    expect(tokens[0].key).toBe('50');
    expect(tokens[tokens.length - 1].key).toBe('950');
    expect(tokens[0].hex).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe('rampToTokens', () => {
  it('keys tokens by 1-based step index, lightest first', () => {
    const tokens = rampToTokens(oklchRamp(hex));
    expect(tokens).toHaveLength(20);
    expect(tokens.map((t) => t.key)).toEqual(
      Array.from({ length: 20 }, (_, i) => String(i + 1)),
    );
    // Lightest first: token 1's L should exceed token 20's L.
    expect(tokens[0].oklch.l).toBeGreaterThan(tokens[19].oklch.l);
  });
});

describe('tokenValue', () => {
  it('returns the hex verbatim in hex mode', () => {
    const t = rampToTokens(oklchRamp(hex))[0];
    expect(tokenValue(t, 'hex')).toBe(t.hex);
  });
  it('returns an oklch() string derived from the hex in oklch mode', () => {
    const t = rampToTokens(oklchRamp(hex))[0];
    const v = tokenValue(t, 'oklch');
    expect(v).toMatch(/^oklch\([\d.]+ [\d.]+ [\d.]+\)$/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/tokens.spec.ts`
Expected: FAIL — `Failed to resolve import "../src/lib/exports/tokens"` (module does not exist yet).

- [ ] **Step 3: Write the module**

Create `src/lib/exports/tokens.ts`:

```ts
/**
 * Shared export-token layer.
 *
 * The five serializers in this directory used to take a `TailwindScale` and
 * key their output off `s.stop`. To also export the OKLCH ramp (which has no
 * stops, only a 1..20 step index) we normalize BOTH palette shapes into a
 * flat `ColorToken[]` here, and let serializers code against that.
 *
 * `tokenValue` renders a token as either a hex string or an `oklch()` string.
 * The oklch() form is derived from the *rendered hex* (via the same
 * `formatForCopy` the per-row "copy as OKLCH" uses), NOT from the ramp's
 * pre-clamp target OKLCH — so exports never emit out-of-gamut values and stay
 * consistent with what the UI shows.
 */

import type { ContinuousRamp, Hex, OKLCH, TailwindScale } from '../color/types';
import { formatForCopy } from '../color/format';

export interface ColorToken {
  /** Token name suffix: '50'..'950' for the scale, '1'..'20' for the ramp. */
  key: string;
  hex: Hex;
  oklch: OKLCH;
}

export type ValueMode = 'hex' | 'oklch';

/**
 * Brand-name → CSS-safe slug. Lowercase, non-alphanumerics collapsed to
 * hyphens, leading/trailing hyphens stripped, empty → 'brand'. Single source
 * of truth (previously duplicated in all five serializers).
 */
export function sanitizeName(name: string): string {
  const cleaned = (name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned || 'brand';
}

/** Tailwind 11-stop scale → tokens keyed by stop number. */
export function scaleToTokens(scale: TailwindScale): ColorToken[] {
  return scale.shades.map((s) => ({
    key: String(s.stop),
    hex: s.hex,
    oklch: s.oklch,
  }));
}

/** OKLCH 20-step ramp → tokens keyed by 1-based step index, lightest first. */
export function rampToTokens(ramp: ContinuousRamp): ColorToken[] {
  return ramp.shades.map((s, i) => ({
    key: String(i + 1),
    hex: s.hex,
    oklch: s.oklch,
  }));
}

/** Render a token's value in the requested mode. */
export function tokenValue(t: ColorToken, mode: ValueMode): string {
  return mode === 'oklch' ? formatForCopy(t.hex, 'oklch') : t.hex;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/tokens.spec.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/exports/tokens.ts tests/tokens.spec.ts
git commit -m "feat(exports): add shared token normalization layer"
```

---

## Task 2: Refactor the three CSS-family serializers

These three follow the value-mode toggle. Snapshot their current output first to prove the refactor is byte-identical in hex mode.

**Files:**
- Modify: `src/lib/exports/tailwind-v4.ts`
- Modify: `src/lib/exports/tailwind-v3.ts`
- Modify: `src/lib/exports/css-vars.ts`
- Test: `tests/tokens.spec.ts` (append)

- [ ] **Step 1: Write failing tests (regression + oklch mode)**

Append to `tests/tokens.spec.ts`:

```ts
import { toTailwindV4 } from '../src/lib/exports/tailwind-v4';
import { toTailwindV3 } from '../src/lib/exports/tailwind-v3';
import { toCssVars } from '../src/lib/exports/css-vars';

describe('CSS-family serializers (new tokens signature)', () => {
  const scaleTokens = scaleToTokens(buildScale(hex));
  const rampTokens = rampToTokens(oklchRamp(hex));

  it('tailwind-v4 emits --color-{slug}-{key} in hex mode', () => {
    const out = toTailwindV4(scaleTokens, 'brand', 'hex');
    expect(out).toContain('@theme {');
    expect(out).toContain('--color-brand-500:');
    expect(out).toMatch(/--color-brand-500: #[0-9a-f]{6};/);
  });

  it('tailwind-v4 emits oklch() values in oklch mode', () => {
    const out = toTailwindV4(rampTokens, 'brand', 'oklch');
    expect(out).toContain('--color-brand-1: oklch(');
    expect(out).toContain('--color-brand-20: oklch(');
  });

  it('css-vars emits --{slug}-{key} and follows the value mode', () => {
    expect(toCssVars(scaleTokens, 'brand', 'hex')).toMatch(/--brand-500: #[0-9a-f]{6};/);
    expect(toCssVars(rampTokens, 'brand', 'oklch')).toContain('--brand-1: oklch(');
  });

  it('tailwind-v3 ramp keys are valid quoted JS object keys', () => {
    const out = toTailwindV3(rampTokens, 'brand', 'hex');
    expect(out).toContain("'1': '#");
    expect(out).toContain("'20': '#");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/tokens.spec.ts`
Expected: FAIL — current serializers take `(scale, name)`; calling with three args and a `ColorToken[]` first arg produces type/runtime errors (`s.stop`/`scale.shades` undefined on an array).

- [ ] **Step 3: Rewrite `tailwind-v4.ts`**

Replace the whole file:

```ts
/**
 * Tailwind v4 `@theme` block export.
 *
 * Produces a `@theme` directive of `--color-{name}-{key}` custom properties.
 * `key` is the Tailwind stop (50..950) or the OKLCH ramp index (1..20),
 * supplied by the caller as a normalized ColorToken[].
 */

import { sanitizeName, tokenValue, type ColorToken, type ValueMode } from './tokens';

export function toTailwindV4(
  tokens: ColorToken[],
  name: string,
  valueMode: ValueMode,
): string {
  const slug = sanitizeName(name);
  const lines = tokens.map(
    (t) => `  --color-${slug}-${t.key}: ${tokenValue(t, valueMode)};`,
  );
  return `@theme {\n${lines.join('\n')}\n}\n`;
}
```

- [ ] **Step 4: Rewrite `css-vars.ts`**

Replace the whole file:

```ts
/**
 * Plain CSS custom properties export.
 *
 * Same shape as the Tailwind v4 export but without the `@theme` wrapper and
 * without the `color-` prefix (that prefix is Tailwind-v4-specific). Variable
 * names follow `--{name}-{key}`.
 */

import { sanitizeName, tokenValue, type ColorToken, type ValueMode } from './tokens';

export function toCssVars(
  tokens: ColorToken[],
  name: string,
  valueMode: ValueMode,
): string {
  const slug = sanitizeName(name);
  const lines = tokens.map((t) => `  --${slug}-${t.key}: ${tokenValue(t, valueMode)};`);
  return `:root {\n${lines.join('\n')}\n}\n`;
}
```

- [ ] **Step 5: Rewrite `tailwind-v3.ts`**

Replace the whole file:

```ts
/**
 * Tailwind v3 config snippet export.
 *
 * Produces the full `module.exports = { ... }` snippet. The brand key and the
 * per-shade keys are quoted strings so a hyphenated slug (e.g. burnt-orange)
 * or a bare numeric key stays a valid JS object literal when the pasted config
 * is require()'d.
 */

import { sanitizeName, tokenValue, type ColorToken, type ValueMode } from './tokens';

export function toTailwindV3(
  tokens: ColorToken[],
  name: string,
  valueMode: ValueMode,
): string {
  const slug = sanitizeName(name);
  const entries = tokens
    .map((t) => `          '${t.key}': '${tokenValue(t, valueMode)}',`)
    .join('\n');
  return [
    `module.exports = {`,
    `  theme: {`,
    `    extend: {`,
    `      colors: {`,
    `        '${slug}': {`,
    entries,
    `        },`,
    `      },`,
    `    },`,
    `  },`,
    `};`,
    '',
  ].join('\n');
}
```

- [ ] **Step 6: Run to verify it passes**

Run: `npx vitest run tests/tokens.spec.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/exports/tailwind-v4.ts src/lib/exports/css-vars.ts src/lib/exports/tailwind-v3.ts tests/tokens.spec.ts
git commit -m "refactor(exports): CSS-family serializers consume tokens + value mode"
```

---

## Task 3: Refactor the two JSON serializers (always hex)

W3C + Figma accept the `valueMode` parameter for a uniform signature but **ignore it and always emit hex**, so imports stay valid.

**Files:**
- Modify: `src/lib/exports/w3c-tokens.ts`
- Modify: `src/lib/exports/figma-vars.ts`
- Test: `tests/tokens.spec.ts` (append)

- [ ] **Step 1: Write the failing tests**

Append to `tests/tokens.spec.ts`:

```ts
import { toW3CTokens } from '../src/lib/exports/w3c-tokens';
import { toFigmaVars } from '../src/lib/exports/figma-vars';

describe('JSON serializers stay hex even in oklch mode', () => {
  const rampTokens = rampToTokens(oklchRamp(hex));

  it('w3c-tokens emits hex $value despite oklch mode', () => {
    const out = toW3CTokens(rampTokens, 'brand', 'oklch');
    const json = JSON.parse(out);
    expect(json.brand['1'].$value).toMatch(/^#[0-9a-f]{6}$/);
    expect(json.brand['1'].$type).toBe('color');
    expect(out).not.toContain('oklch(');
  });

  it('figma-vars emits hex values despite oklch mode', () => {
    const out = toFigmaVars(rampTokens, 'brand', 'oklch');
    const json = JSON.parse(out);
    const v = json.collections[0].variables[0];
    expect(v.name).toBe('brand/1');
    expect(Object.values(v.valuesByMode)[0]).toMatch(/^#[0-9a-f]{6}$/);
    expect(out).not.toContain('oklch(');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/tokens.spec.ts`
Expected: FAIL — old signatures `(scale, name)`; `scale.shades` is undefined on an array.

- [ ] **Step 3: Rewrite `w3c-tokens.ts`**

Replace the whole file:

```ts
/**
 * W3C Design Tokens (DTCG) JSON export.
 *
 * Each color is `{ $value, $type: "color" }`, nested under the brand `name`.
 * Reference: https://tr.designtokens.org/format/
 *
 * NOTE: always emits hex. The DTCG `color` $type expects a hex/sRGB string;
 * emitting `oklch(...)` would produce non-standard tokens, so this serializer
 * ignores `valueMode` by design.
 */

import { sanitizeName, type ColorToken, type ValueMode } from './tokens';

export function toW3CTokens(
  tokens: ColorToken[],
  name: string,
  _valueMode: ValueMode,
): string {
  const slug = sanitizeName(name);
  const inner: Record<string, { $value: string; $type: 'color' }> = {};
  for (const t of tokens) {
    inner[t.key] = { $value: t.hex, $type: 'color' };
  }
  return JSON.stringify({ [slug]: inner }, null, 2) + '\n';
}
```

- [ ] **Step 4: Rewrite `figma-vars.ts`**

Replace the whole file:

```ts
/**
 * Figma Variables JSON export (for the "Variables Import" community plugin).
 *
 * A single "Default" mode collection of COLOR variables named `{slug}/{key}`.
 *
 * NOTE: always emits hex. The plugin parses hex strings into COLOR variables;
 * an `oklch(...)` string would fail the import, so this serializer ignores
 * `valueMode` by design.
 */

import { sanitizeName, type ColorToken, type ValueMode } from './tokens';

export function toFigmaVars(
  tokens: ColorToken[],
  name: string,
  _valueMode: ValueMode,
): string {
  const slug = sanitizeName(name);
  const modeId = '1:0';
  const variables = tokens.map((t) => ({
    name: `${slug}/${t.key}`,
    type: 'COLOR' as const,
    valuesByMode: {
      [modeId]: t.hex,
    },
  }));
  const out = {
    version: '1.0',
    collections: [
      {
        name: slug,
        modes: [{ modeId, name: 'Default' }],
        variables,
      },
    ],
  };
  return JSON.stringify(out, null, 2) + '\n';
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run tests/tokens.spec.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/exports/w3c-tokens.ts src/lib/exports/figma-vars.ts tests/tokens.spec.ts
git commit -m "refactor(exports): JSON serializers consume tokens, pin hex output"
```

---

## Task 4: Fix the existing exports.spec.ts callsite

The `toTailwindV3` signature changed, so the existing regression test no longer compiles.

**Files:**
- Modify: `tests/exports.spec.ts`

- [ ] **Step 1: Run the existing test to confirm it now breaks**

Run: `npx vitest run tests/exports.spec.ts`
Expected: FAIL — `toTailwindV3(scale, 'Burnt Orange')` passes a `TailwindScale` where a `ColorToken[]` is expected; output no longer contains the expected strings.

- [ ] **Step 2: Update the imports and callsites**

In `tests/exports.spec.ts`:

Change the import block (lines ~11-14) from:

```ts
import { describe, it, expect } from 'vitest';
import { buildScale } from '../src/lib/color/scale';
import { parseColor } from '../src/lib/color/parse';
import { toTailwindV3 } from '../src/lib/exports/tailwind-v3';

const scale = buildScale(parseColor('#ff7f50'));
```

to:

```ts
import { describe, it, expect } from 'vitest';
import { buildScale } from '../src/lib/color/scale';
import { parseColor } from '../src/lib/color/parse';
import { toTailwindV3 } from '../src/lib/exports/tailwind-v3';
import { scaleToTokens } from '../src/lib/exports/tokens';

const tokens = scaleToTokens(buildScale(parseColor('#ff7f50')));
```

Then update the three `toTailwindV3(scale, …)` calls to `toTailwindV3(tokens, …, 'hex')`:

```ts
    const out = toTailwindV3(tokens, 'Burnt Orange', 'hex'); // -> slug "burnt-orange"
```
```ts
    const cfg = evalConfig(toTailwindV3(tokens, 'coral', 'hex'));
```
```ts
    const cfg = evalConfig(toTailwindV3(tokens, '!!!', 'hex'));
```

- [ ] **Step 3: Run to verify it passes**

Run: `npx vitest run tests/exports.spec.ts`
Expected: PASS (all three cases — output unchanged from before in hex mode).

- [ ] **Step 4: Run the full unit suite to confirm nothing else references old signatures**

Run: `npm test`
Expected: PASS. If any other file imports a serializer with the old signature, fix it the same way (tokens + `'hex'`). (Known callers: `ExportDropdown.tsx` — handled in Task 5.)

- [ ] **Step 5: Commit**

```bash
git add tests/exports.spec.ts
git commit -m "test(exports): update tailwind-v3 regression to tokens signature"
```

---

## Task 5: Generalize ExportDropdown (tokens + value toggle)

**Files:**
- Modify: `src/components/ExportDropdown.tsx`

- [ ] **Step 1: Update props, serialize(), and the value-mode toggle**

In `src/components/ExportDropdown.tsx`:

Replace the import + props + `serialize` block (lines ~3-56) with:

```ts
import type { ExportFormat } from '../lib/color/types';
import type { ColorToken, ValueMode } from '../lib/exports/tokens';
import { toTailwindV4 } from '../lib/exports/tailwind-v4';
import { toTailwindV3 } from '../lib/exports/tailwind-v3';
import { toCssVars } from '../lib/exports/css-vars';
import { toW3CTokens } from '../lib/exports/w3c-tokens';
import { toFigmaVars } from '../lib/exports/figma-vars';
import { useToast } from './Toast';

export interface ExportDropdownProps {
  tokens: ColorToken[];
  format: ExportFormat;
  brandName?: string;
  /** Current value mode (hex | oklch). */
  valueMode: ValueMode;
  /** Fired when the user flips the hex/oklch toggle. */
  onValueModeChange: (m: ValueMode) => void;
  /** Show the hex/oklch toggle. True only for the OKLCH ramp view. */
  showValueToggle: boolean;
  onFormatChange: (next: ExportFormat) => void;
  onCopy: (text: string) => void;
}

const FORMAT_OPTIONS: { value: ExportFormat; label: string }[] = [
  { value: 'tailwind-v4', label: 'Tailwind v4 (@theme)' },
  { value: 'tailwind-v3', label: 'Tailwind v3 (config)' },
  { value: 'css-vars', label: 'CSS variables' },
  { value: 'w3c-tokens', label: 'W3C Design Tokens' },
  { value: 'figma-vars', label: 'Figma Variables' },
];

function serialize(
  tokens: ColorToken[],
  format: ExportFormat,
  name: string,
  valueMode: ValueMode,
): string {
  switch (format) {
    case 'tailwind-v4':
      return toTailwindV4(tokens, name, valueMode);
    case 'tailwind-v3':
      return toTailwindV3(tokens, name, valueMode);
    case 'css-vars':
      return toCssVars(tokens, name, valueMode);
    case 'w3c-tokens':
      return toW3CTokens(tokens, name, valueMode);
    case 'figma-vars':
      return toFigmaVars(tokens, name, valueMode);
  }
}
```

- [ ] **Step 2: Update the component body to use tokens + render the toggle**

In the default export `ExportDropdown(...)`:

Change the destructure and the `text` memo:

```ts
export default function ExportDropdown({
  tokens,
  format,
  brandName,
  valueMode,
  onValueModeChange,
  showValueToggle,
  onFormatChange,
  onCopy,
}: ExportDropdownProps) {
  const name = (brandName || 'brand').trim() || 'brand';
  const text = useMemo(
    () => serialize(tokens, format, name, valueMode),
    [tokens, format, name, valueMode],
  );
```

Inside the returned JSX, immediately after the closing `</label>` of the "Export as" select (right before `<div className="flex items-center gap-2">` holding the copy/view buttons), insert the toggle:

```tsx
        {showValueToggle && (
          <div
            role="group"
            aria-label="Export value format"
            className="inline-flex overflow-hidden rounded-sm border border-ink/20 font-mono text-[11px]"
          >
            {(['hex', 'oklch'] as const).map((m) => {
              const active = valueMode === m;
              return (
                <button
                  key={m}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onValueModeChange(m)}
                  className={[
                    'px-2.5 py-1 uppercase tracking-tight transition-colors duration-150 ease-out',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60',
                    active ? 'bg-ink text-paper' : 'text-ink/70 hover:bg-paper-2 hover:text-ink',
                  ].join(' ')}
                >
                  {m === 'hex' ? 'Hex' : 'OKLCH'}
                </button>
              );
            })}
          </div>
        )}
```

- [ ] **Step 3: Update the modal to take tokens + valueMode**

Update the `<ExportModal ... />` invocation (replace `scale={scale}` with `tokens={tokens}` and add `valueMode={valueMode}`):

```tsx
      {modalOpen && (
        <ExportModal
          tokens={tokens}
          name={name}
          format={format}
          valueMode={valueMode}
          canCopy={canCopy}
          onFormatChange={onFormatChange}
          onCopy={copyText}
          onClose={closeModal}
          triggerRef={viewTriggerRef}
        />
      )}
```

Update the `ExportModal` signature + its `text` memo:

```tsx
function ExportModal({
  tokens,
  name,
  format,
  valueMode,
  canCopy,
  onFormatChange,
  onCopy,
  onClose,
  triggerRef,
}: {
  tokens: ColorToken[];
  name: string;
  format: ExportFormat;
  valueMode: ValueMode;
  canCopy: boolean;
  onFormatChange: (next: ExportFormat) => void;
  onCopy: (value: string, label: ExportFormat) => void;
  onClose: () => void;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const text = useMemo(
    () => serialize(tokens, format, name, valueMode),
    [tokens, format, name, valueMode],
  );
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: errors ONLY in `TailwindScale.tsx` (still passes `scale=`), which Task 6 fixes. No errors inside `ExportDropdown.tsx` itself.

- [ ] **Step 5: Commit**

```bash
git add src/components/ExportDropdown.tsx
git commit -m "feat(exports): ExportDropdown takes tokens + hex/oklch toggle"
```

---

## Task 6: Update TailwindScale to the new ExportDropdown props

**Files:**
- Modify: `src/components/TailwindScale.tsx`

- [ ] **Step 1: Pass tokens + hex value mode, toggle off**

In `src/components/TailwindScale.tsx`:

Add an import near the top (after the existing type import):

```ts
import { scaleToTokens } from '../lib/exports/tokens';
```

Replace the `<ExportDropdown ... />` block (lines ~52-58) with:

```tsx
        <ExportDropdown
          tokens={scaleToTokens(scale)}
          format={exportFormat}
          brandName={brandName}
          valueMode="hex"
          onValueModeChange={() => {}}
          showValueToggle={false}
          onFormatChange={onExportFormatChange}
          onCopy={onExportCopy}
        />
```

(The `scale` prop is still used for the row grid below and `data-anchor-stop`, so the rest of the file is unchanged. `onValueModeChange` is a no-op here because `showValueToggle` is false — the toggle never renders.)

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (no errors).

- [ ] **Step 3: Run unit tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/TailwindScale.tsx
git commit -m "refactor(scale): feed ExportDropdown normalized tokens, toggle off"
```

---

## Task 7: Mount ExportDropdown inside ContinuousRamp

**Files:**
- Modify: `src/components/ContinuousRamp.tsx`

- [ ] **Step 1: Add the lazy export panel and props**

Replace the entire contents of `src/components/ContinuousRamp.tsx` with:

```tsx
import { lazy, Suspense } from 'react';
import type {
  ContinuousRamp as ContinuousRampData,
  CopyFormat,
  ExportFormat,
  Hex,
} from '../lib/color/types';
import type { ValueMode } from '../lib/exports/tokens';
import { rampToTokens } from '../lib/exports/tokens';
import ShadeRow from './ShadeRow';

/**
 * Renders a `ContinuousRamp` (OKLCH 20-step ramp) as a stack of `<ShadeRow>`
 * entries, with the shared export dropdown atop it. The export panel (the
 * dropdown UI + the five serializers) is the heaviest leaf of the island, so
 * it loads behind the same `React.lazy` boundary `TailwindScale` uses — both
 * views resolve the same chunk, so it downloads once.
 *
 * Ramp tokens are keyed by 1-based step index (1..20), and the hex/oklch()
 * value toggle is shown here (it is hidden in the Tailwind view).
 */

const ExportDropdown = lazy(() => import('./ExportDropdown'));

export interface ContinuousRampProps {
  ramp: ContinuousRampData;
  /** Pinned source hex - every non-source row renders this in a 20% band. */
  sourceHex: Hex;
  copyFormat: CopyFormat;
  exportFormat: ExportFormat;
  valueMode: ValueMode;
  brandName?: string;
  onCopy: (hex: Hex) => void;
  onNavigate: (hex: Hex) => void;
  onExportCopy: (text: string) => void;
  onExportFormatChange: (next: ExportFormat) => void;
  onValueModeChange: (m: ValueMode) => void;
}

export default function ContinuousRamp({
  ramp,
  sourceHex,
  copyFormat,
  exportFormat,
  valueMode,
  brandName,
  onCopy,
  onNavigate,
  onExportCopy,
  onExportFormatChange,
  onValueModeChange,
}: ContinuousRampProps) {
  return (
    <div className="flex flex-col gap-4">
      <Suspense fallback={<ExportDropdownFallback />}>
        <ExportDropdown
          tokens={rampToTokens(ramp)}
          format={exportFormat}
          brandName={brandName}
          valueMode={valueMode}
          onValueModeChange={onValueModeChange}
          showValueToggle={true}
          onFormatChange={onExportFormatChange}
          onCopy={onExportCopy}
        />
      </Suspense>
      <div
        data-ramp-mode={ramp.mode}
        data-shade-count={ramp.shades.length}
        role="list"
        aria-label="OKLCH ramp"
        className="flex w-full flex-col gap-[2px] border-b border-ink/15"
      >
        {ramp.shades.map((shade, i) => (
          <div role="listitem" key={`${shade.hex}-${i}`}>
            <ShadeRow
              shade={shade}
              sourceHex={sourceHex}
              copyFormat={copyFormat}
              brandName={brandName}
              onCopy={onCopy}
              onNavigate={onNavigate}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Height-stable placeholder for the lazy `ExportDropdown` chunk — mirrors the
 * one in `TailwindScale` so the ramp rows don't jump when the chunk arrives.
 */
function ExportDropdownFallback() {
  return (
    <div aria-hidden="true" className="flex items-center gap-3">
      <div className="h-7 w-40 bg-paper-2 motion-safe:animate-pulse" />
      <div className="h-7 w-7 bg-paper-2 motion-safe:animate-pulse" />
      <div className="h-7 w-7 bg-paper-2 motion-safe:animate-pulse" />
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: errors ONLY in `ShadeTool.tsx` (it renders `<ContinuousRamp>` without the new required props), fixed in Task 8.

- [ ] **Step 3: Commit**

```bash
git add src/components/ContinuousRamp.tsx
git commit -m "feat(ramp): mount lazy export dropdown above the OKLCH ramp"
```

---

## Task 8: Wire oklchValueMode state in ShadeTool

**Files:**
- Modify: `src/components/ShadeTool.tsx`

- [ ] **Step 1: Add the storage key**

In `STORAGE_KEYS` (around line 56-64), add a line after `view`:

```ts
  view: 'shades.view',
  oklchValueMode: 'shades.oklchValueMode',
```

- [ ] **Step 2: Import the ValueMode type**

Add to the type import from `../lib/exports/tokens`. Near the other component imports (after `import TailwindScale from './TailwindScale';`), add:

```ts
import type { ValueMode } from '../lib/exports/tokens';
```

- [ ] **Step 3: Add the persisted state**

After the `exportFormat` `usePersistedState` block (ends around line 312), add:

```ts
  // OKLCH-view export value mode (hex vs oklch()). localStorage-only (no URL
  // param — keeps `/[hex]` URLs clean, same policy as copyFormat). Default
  // 'oklch' so the ramp export leads with its distinctive wide-gamut payload.
  const [oklchValueMode, setOklchValueMode] = usePersistedState<ValueMode>(
    STORAGE_KEYS.oklchValueMode,
    ['hex', 'oklch'] as const,
    'oklch',
    null,
  );
```

- [ ] **Step 4: Pass the new props into ContinuousRamp**

Replace the `<ContinuousRamp ... />` block (around lines 873-880) with:

```tsx
              <ContinuousRamp
                ramp={ramp}
                sourceHex={hex}
                copyFormat={copyFormat}
                exportFormat={exportFormat}
                valueMode={oklchValueMode}
                brandName={brandName}
                onCopy={handleCopyShade}
                onNavigate={handleNavigate}
                onExportCopy={handleExportCopy}
                onExportFormatChange={setExportFormat}
                onValueModeChange={setOklchValueMode}
              />
```

(`exportFormat` / `setExportFormat` are the SAME state the Tailwind view uses — the format preference is shared per the spec.)

- [ ] **Step 5: Typecheck + unit tests**

Run: `npx tsc --noEmit && npm test`
Expected: PASS (no type errors; all unit tests green).

- [ ] **Step 6: Commit**

```bash
git add src/components/ShadeTool.tsx
git commit -m "feat(tool): wire OKLCH export value-mode state into the ramp view"
```

---

## Task 9: Build + e2e coverage

**Files:**
- Modify: `tests/e2e/tool.spec.ts`

- [ ] **Step 1: Produce a production build (Playwright drives the preview)**

Run: `npm run build`
Expected: build succeeds, `dist/` emitted, no type/bundler errors.

- [ ] **Step 2: Add the e2e test**

In `tests/e2e/tool.spec.ts`, add this test inside the same top-level `describe` block (after the existing "export dropdown switches to Tailwind v3" test, ~line 163):

```ts
  test('OKLCH view exports index tokens with a hex/oklch value toggle', async ({
    page,
    browserName,
  }) => {
    // Same webkit lazy-export-panel click-delivery flakiness as the Tailwind
    // export test above; real Safari is unaffected.
    test.fixme(browserName === 'webkit', 'webkit click delivery on the lazy export panel');

    await page.goto('/4040ff?view=ramp');

    // The export dropdown now exists in the OKLCH view too.
    await page.getByLabel(/^Export as/).selectOption('css-vars');

    // Default value mode is OKLCH, so the copied/viewed code uses oklch() and
    // index-based token names (--brand-1 … --brand-20).
    await page.getByRole('button', { name: /view export code/i }).click();
    const preview = page.locator('pre[data-export-preview="true"]');
    await expect(preview).toBeVisible();
    let text = await preview.innerText();
    expect(text).toContain('--brand-1:');
    expect(text).toContain('--brand-20:');
    expect(text).toContain('oklch(');

    // Flip to Hex via the value toggle; the same format now emits hex values.
    await page.getByRole('button', { name: 'Hex' }).click();
    text = await preview.innerText();
    expect(text).toContain('--brand-1: #');
    expect(text).not.toContain('oklch(');
  });
```

- [ ] **Step 3: Run the new e2e test (chromium)**

Run: `npx playwright test tests/e2e/tool.spec.ts --project=chromium -g "OKLCH view exports"`
Expected: PASS.

- [ ] **Step 4: Run the full tool e2e file (chromium) to catch regressions**

Run: `npx playwright test tests/e2e/tool.spec.ts --project=chromium`
Expected: PASS (the existing "export dropdown only in scale view" assertion at the `?view=scale` deep-link test still holds — that test never switches to ramp).

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/tool.spec.ts
git commit -m "test(e2e): OKLCH view export dropdown + hex/oklch toggle"
```

---

## Task 10: Final verification

- [ ] **Step 1: Full unit suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 2: Full e2e matrix**

Run: `npm run test:e2e`
Expected: PASS (webkit export cases are `test.fixme`, reported as skipped).

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: success.

- [ ] **Step 4: Manual smoke (optional but recommended)**

Run: `npm run preview`, open `http://127.0.0.1:4321/4040ff?view=ramp`. Confirm: an "Export as" dropdown + a `[ Hex | OKLCH ]` toggle appear above the 20 ramp rows; picking "CSS variables" + "View code" shows `--brand-1: oklch(...)` … `--brand-20`; flipping to Hex shows `#rrggbb`; selecting "Figma Variables" shows hex even while the toggle reads OKLCH.

---

## Notes for the implementer

- **DRY:** `sanitizeName` now lives ONLY in `tokens.ts`. If you see it anywhere else after Task 3, delete that copy.
- **Byte-identical Tailwind output:** the Tailwind view passes `valueMode="hex"` and the same `scaleToTokens(scale)` keys (`'50'`…`'950'`), so every existing export string is unchanged. The `exports.spec.ts` regression (Task 4) guards this.
- **Shared chunk:** both `TailwindScale` and `ContinuousRamp` do `lazy(() => import('./ExportDropdown'))`. The bundler dedupes to one chunk — don't try to "share" the lazy reference across files.
- **No URL param for value mode:** `oklchValueMode` uses `urlParam = null` in `usePersistedState`, exactly like `copyFormat`. Do not add a `?`-param for it.
- **Pre-existing WIP:** `ShadeTool.tsx` and `tests/e2e/tool.spec.ts` had uncommitted edits before this work began. Line numbers in this plan are approximate; match on surrounding code, not exact lines.
