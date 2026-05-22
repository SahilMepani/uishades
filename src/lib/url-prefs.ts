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
import type { CopyFormat, ExportFormat, RampMode } from './color/types';

type View = 'ramp' | 'scale';

const VIEW_VALUES: readonly View[] = ['ramp', 'scale'] as const;
const MODE_VALUES: readonly RampMode[] = ['oklch', 'classic'] as const;
const FMT_VALUES: readonly ExportFormat[] = [
  'tailwind-v4',
  'tailwind-v3',
  'css-vars',
  'w3c-tokens',
  'figma-vars',
] as const;
const COPY_VALUES: readonly CopyFormat[] = [
  'hex',
  'rgb',
  'hsl',
  'hsv',
  'hwb',
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
  mode?: RampMode;
  fmt?: ExportFormat;
  copy?: CopyFormat;
}

export function readInitialPrefs(url: URL): InitialPrefs {
  return {
    view: pick(url.searchParams.get('view'), VIEW_VALUES),
    mode: pick(url.searchParams.get('mode'), MODE_VALUES),
    fmt: pick(url.searchParams.get('fmt'), FMT_VALUES),
    copy: pick(url.searchParams.get('copy'), COPY_VALUES),
  };
}
