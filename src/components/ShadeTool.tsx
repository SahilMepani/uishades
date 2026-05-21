import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import type {
  CopyFormat,
  ExportFormat,
  Hex,
  RampMode,
} from '../lib/color/types';
import { parseColor } from '../lib/color/parse';
import { oklchRamp } from '../lib/color/ramp';
import { classicRamp } from '../lib/color/classic';
import { buildScale } from '../lib/color/scale';
import { findByHex } from '../lib/data/named-colors';
import ColorInput from './ColorInput';
import ContinuousRamp from './ContinuousRamp';
import TailwindScale from './TailwindScale';
import { ToastProvider, useToast } from './Toast';

/**
 * Top-level React island for the shade tool.
 *
 * Owns:
 *   - current hex (URL-synced)
 *   - view mode (ramp vs scale)
 *   - ramp mode (oklch vs classic) — persisted in localStorage
 *   - copy-format preference — persisted in localStorage
 *   - export-format preference — persisted in localStorage
 *   - view selection — persisted in localStorage
 *
 * URL sync: each new hex calls `history.replaceState` to update the path.
 * On the development page (`/_dev/tool`) we update the `?c=` search param
 * instead so a refresh doesn't drop the user onto the real route while
 * the wave-2b pages are being built in parallel.
 */

const STORAGE_KEYS = {
  copyFormat: 'shades.copyFormat',
  rampMode: 'shades.rampMode',
  exportFormat: 'shades.exportFormat',
  view: 'shades.view',
} as const;

type View = 'ramp' | 'scale';

/**
 * Lazy initializer that reads a value from localStorage on the client,
 * falling back to `fallback` during SSR or if the entry is invalid.
 */
function readStored<T extends string>(
  key: string,
  allowed: readonly T[],
  fallback: T,
): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const v = window.localStorage.getItem(key);
    if (v && (allowed as readonly string[]).includes(v)) return v as T;
  } catch {
    /* localStorage may be unavailable in private mode */
  }
  return fallback;
}

function usePersistedState<T extends string>(
  key: string,
  allowed: readonly T[],
  fallback: T,
): [T, Dispatch<SetStateAction<T>>] {
  // Initial render returns the fallback so SSR and the first client render
  // match. A follow-up effect hydrates the real value from localStorage.
  const [value, setValue] = useState<T>(fallback);
  useEffect(() => {
    const stored = readStored(key, allowed, fallback);
    if (stored !== fallback) setValue(stored);
    // intentionally only on mount — `key`, `allowed`, `fallback` are stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(key, value);
    } catch {
      /* ignore */
    }
  }, [key, value]);
  return [value, setValue];
}

function normalizeHexInput(input: string): Hex {
  // Accept '4040ff', '#4040ff', etc. Falls back to a known-good default on
  // garbage so the tool always renders.
  try {
    return parseColor(input);
  } catch {
    return '#4040ff';
  }
}

function isDevHostingRoute(): boolean {
  if (typeof window === 'undefined') return false;
  return window.location.pathname.startsWith('/_dev/');
}

function syncUrl(hex: Hex) {
  if (typeof window === 'undefined') return;
  try {
    if (isDevHostingRoute()) {
      const url = new URL(window.location.href);
      url.searchParams.set('c', hex.slice(1));
      window.history.replaceState(null, '', url.toString());
    } else {
      window.history.replaceState(null, '', '/' + hex.slice(1));
    }
  } catch {
    /* ignore — URL update is best-effort */
  }
}

export interface ShadeToolProps {
  initialHex: Hex;
}

export default function ShadeTool({ initialHex }: ShadeToolProps) {
  return (
    <ToastProvider>
      <ShadeToolInner initialHex={initialHex} />
    </ToastProvider>
  );
}

function ShadeToolInner({ initialHex }: ShadeToolProps) {
  const [hex, setHex] = useState<Hex>(() => normalizeHexInput(initialHex));
  const [view, setView] = usePersistedState<View>(
    STORAGE_KEYS.view,
    ['ramp', 'scale'] as const,
    'ramp',
  );
  const [rampMode, setRampMode] = usePersistedState<RampMode>(
    STORAGE_KEYS.rampMode,
    ['oklch', 'classic'] as const,
    'oklch',
  );
  const [copyFormat, setCopyFormat] = usePersistedState<CopyFormat>(
    STORAGE_KEYS.copyFormat,
    ['hex', 'rgb', 'hsl', 'oklch', 'cssVar', 'tailwindClass'] as const,
    'hex',
  );
  const [exportFormat, setExportFormat] = usePersistedState<ExportFormat>(
    STORAGE_KEYS.exportFormat,
    ['tailwind-v4', 'tailwind-v3', 'css-vars', 'w3c-tokens', 'figma-vars'] as const,
    'tailwind-v4',
  );

  const { pushToast } = useToast();

  // Derive ramp + scale lazily from inputs.
  const ramp = useMemo(() => {
    return rampMode === 'oklch' ? oklchRamp(hex) : classicRamp(hex);
  }, [hex, rampMode]);
  const scale = useMemo(() => buildScale(hex), [hex]);

  const named = useMemo(() => findByHex(hex), [hex]);
  // Default brand name: the named-color slug if we have one, else "brand".
  // (Assumption documented in the implementation report.)
  const brandName = named?.slug ?? 'brand';

  // URL sync whenever the hex changes from any source.
  useEffect(() => {
    syncUrl(hex);
  }, [hex]);

  const handleChangeHex = useCallback((next: Hex) => {
    setHex(next);
  }, []);

  const handleCopyShade = useCallback(
    (h: Hex) => {
      pushToast(`Copied ${h}`);
    },
    [pushToast],
  );

  const handleNavigate = useCallback((h: Hex) => {
    if (typeof window !== 'undefined') {
      window.location.href = '/' + h.slice(1);
    }
  }, []);

  const handleExportCopy = useCallback(() => {
    pushToast(`Copied ${exportFormat} export`);
  }, [pushToast, exportFormat]);

  return (
    <div className="min-h-screen bg-white text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      {/* Mobile sticky header: visible only < lg */}
      <div className="sticky top-0 z-30 border-b border-neutral-200 bg-white/85 backdrop-blur lg:hidden dark:border-neutral-800 dark:bg-neutral-950/85">
        <div className="flex items-center gap-3 px-4 py-3">
          <div
            aria-hidden="true"
            className="h-10 w-10 shrink-0 rounded-md ring-1 ring-black/10"
            style={{ backgroundColor: hex }}
          />
          <div className="min-w-0 flex-1">
            <div className="truncate font-mono text-sm">{hex}</div>
            {named && (
              <div className="truncate text-xs text-neutral-500">{named.name}</div>
            )}
          </div>
        </div>
        <div className="px-4 pb-3">
          <ColorInput value={hex} onChange={handleChangeHex} />
        </div>
      </div>

      <div className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[2fr_3fr] lg:gap-10 lg:px-8 lg:py-10">
        {/* Left rail: preview + input + controls (sticky on desktop) */}
        <aside className="hidden lg:block lg:sticky lg:top-6 lg:self-start">
          <PreviewBlock hex={hex} named={named} />
          <div className="mt-4 flex flex-col gap-4">
            <ColorInput value={hex} onChange={handleChangeHex} />

            <ViewToggle view={view} onChange={setView} />

            {view === 'ramp' && (
              <RampModeToggle mode={rampMode} onChange={setRampMode} />
            )}

            <CopyFormatPicker
              value={copyFormat}
              onChange={setCopyFormat}
              hasStop={view === 'scale'}
            />
          </div>
        </aside>

        {/* Right column: ramp or scale + view/mode toggles on mobile */}
        <section className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 lg:hidden">
            <ViewToggle view={view} onChange={setView} />
            {view === 'ramp' && (
              <RampModeToggle mode={rampMode} onChange={setRampMode} />
            )}
            <CopyFormatPicker
              value={copyFormat}
              onChange={setCopyFormat}
              hasStop={view === 'scale'}
            />
          </div>

          {view === 'ramp' ? (
            <ContinuousRamp
              ramp={ramp}
              copyFormat={copyFormat}
              brandName={brandName}
              onCopy={handleCopyShade}
              onNavigate={handleNavigate}
            />
          ) : (
            <TailwindScale
              scale={scale}
              copyFormat={copyFormat}
              exportFormat={exportFormat}
              brandName={brandName}
              onCopy={handleCopyShade}
              onNavigate={handleNavigate}
              onExportCopy={handleExportCopy}
              onExportFormatChange={setExportFormat}
            />
          )}
        </section>
      </div>
    </div>
  );
}

function PreviewBlock({ hex, named }: { hex: Hex; named: ReturnType<typeof findByHex> }) {
  return (
    <div
      role="img"
      aria-label={`Color ${hex}`}
      className="flex aspect-square w-full items-end overflow-hidden rounded-xl ring-1 ring-black/10"
      style={{ backgroundColor: hex }}
    >
      <div className="m-4 inline-flex flex-col rounded-md bg-white/80 px-3 py-2 backdrop-blur dark:bg-neutral-900/70">
        <span className="font-mono text-base">{hex}</span>
        {named && (
          <span className="text-xs text-neutral-600 dark:text-neutral-300">
            {named.name}
          </span>
        )}
      </div>
    </div>
  );
}

function ViewToggle({
  view,
  onChange,
}: {
  view: View;
  onChange: (v: View) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="View"
      className="inline-flex rounded-md ring-1 ring-neutral-300 dark:ring-neutral-700"
    >
      {(['ramp', 'scale'] as const).map(v => (
        <button
          key={v}
          type="button"
          role="tab"
          aria-selected={view === v}
          aria-label={v === 'ramp' ? 'Continuous ramp' : 'Tailwind scale'}
          onClick={() => onChange(v)}
          className={[
            'px-3 py-1.5 text-sm font-medium first:rounded-l-md last:rounded-r-md',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
            view === v
              ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900'
              : 'text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800',
          ].join(' ')}
        >
          {v === 'ramp' ? 'Continuous ramp' : 'Tailwind scale'}
        </button>
      ))}
    </div>
  );
}

function RampModeToggle({
  mode,
  onChange,
}: {
  mode: RampMode;
  onChange: (m: RampMode) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Ramp algorithm"
      className="inline-flex rounded-md ring-1 ring-neutral-300 dark:ring-neutral-700"
    >
      {(['oklch', 'classic'] as const).map(m => (
        <button
          key={m}
          type="button"
          role="tab"
          aria-selected={mode === m}
          onClick={() => onChange(m)}
          className={[
            'px-3 py-1 text-xs font-medium first:rounded-l-md last:rounded-r-md',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
            mode === m
              ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900'
              : 'text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800',
          ].join(' ')}
        >
          {m === 'oklch' ? 'OKLCH (default)' : 'Classic (0to255)'}
        </button>
      ))}
    </div>
  );
}

const COPY_FORMAT_LABELS: Record<CopyFormat, string> = {
  hex: 'hex',
  rgb: 'rgb()',
  hsl: 'hsl()',
  oklch: 'oklch()',
  cssVar: 'var(--name)',
  tailwindClass: 'bg-name-500',
};

function CopyFormatPicker({
  value,
  onChange,
  hasStop,
}: {
  value: CopyFormat;
  onChange: (f: CopyFormat) => void;
  hasStop: boolean;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-neutral-600 dark:text-neutral-300">Copy as</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as CopyFormat)}
        className={
          'rounded-md bg-white px-2 py-1 text-sm ring-1 ring-neutral-300 ' +
          'dark:bg-neutral-900 dark:ring-neutral-700 ' +
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500'
        }
      >
        {(Object.keys(COPY_FORMAT_LABELS) as CopyFormat[]).map(k => {
          // The cssVar / tailwindClass formats really only make sense in
          // palette mode; surface them only when a stop is available.
          const requiresStop = k === 'cssVar' || k === 'tailwindClass';
          if (requiresStop && !hasStop) return null;
          return (
            <option key={k} value={k}>
              {COPY_FORMAT_LABELS[k]}
            </option>
          );
        })}
      </select>
    </label>
  );
}
