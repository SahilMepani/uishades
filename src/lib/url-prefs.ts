/**
 * Server-side helper for reading the same user-preference URL params that
 * the `usePersistedState` hook in `ShadeTool.tsx` mirrors back to the URL.
 *
 * Keeping the parse here (instead of inline in each page) guarantees the
 * SSR-rendered HTML uses the same validated value the client will read on
 * hydration. If the parameter is missing or unrecognized, we return
 * undefined and the React component falls back to its own default — which
 * matches the localStorage-only behaviour from before this change.
 */
import type { CopyFormat, ExportFormat } from './color/types';

type View = 'ramp' | 'scale';

const VIEW_VALUES: readonly View[] = ['ramp', 'scale'] as const;
// Exported as the single source of truth for the copy/export format
// vocabularies — the presets API validates against these same lists so a new
// format can't be accepted by `?fmt=`/`?copy=` yet silently dropped on save.
export const FMT_VALUES: readonly ExportFormat[] = [
  'tailwind-v4',
  'tailwind-v3',
  'css-vars',
  'w3c-tokens',
  'figma-vars',
] as const;
export const COPY_VALUES: readonly CopyFormat[] = [
  'hex',
  'rgb',
  'hsl',
  'oklch',
  'cssVar',
  'tailwindClass',
] as const;

function pick<T extends string>(
  raw: string | null,
  allowed: readonly T[],
): T | undefined {
  if (!raw) return undefined;
  return (allowed as readonly string[]).includes(raw) ? (raw as T) : undefined;
}

export interface InitialPrefs {
  view?: View;
  fmt?: ExportFormat;
  copy?: CopyFormat;
}

export function readInitialPrefs(url: URL): InitialPrefs {
  return {
    view: pick(url.searchParams.get('view'), VIEW_VALUES),
    fmt: pick(url.searchParams.get('fmt'), FMT_VALUES),
    copy: pick(url.searchParams.get('copy'), COPY_VALUES),
  };
}
