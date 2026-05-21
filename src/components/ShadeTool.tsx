import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
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
import { ToastProvider, useToast } from './Toast';

// Lazy-load the Tailwind scale view + its export panel + serializers. They
// form the heaviest leaf of the React island (Tailwind scale, five export-
// format serializers, the export-dropdown UI) and most first visits only
// need the continuous ramp. Splitting them into a separate chunk keeps the
// initial-load JS smaller; the Suspense fallback below reserves a
// placeholder roughly the same height as the rendered scale so switching
// tabs does not produce a CLS spike.
const TailwindScale = lazy(() => import('./TailwindScale'));

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

/**
 * Hook that owns a single user-preference value with URL > localStorage >
 * server-supplied default precedence.
 *
 * Why this layered shape:
 *   1. The SSR-rendered HTML must match the first client render exactly to
 *      avoid hydration mismatches. We get this by always seeding state from
 *      the same value the server saw — `initial`, derived in the page from
 *      the URL where present and a fallback otherwise.
 *   2. After hydration, we read localStorage. If it disagrees with the URL,
 *      the URL wins (the user explicitly chose this URL by linking or
 *      pasting). If the URL did not carry the preference, localStorage
 *      takes over and we swap in the stored value.
 *   3. From then on, every change writes both localStorage AND the URL so
 *      a deep-link rebuilds the same view on next visit.
 *
 * `urlParam = null` opts a preference out of URL sync (e.g., copy format,
 * which is too noisy to put in the URL on every change).
 */
function usePersistedState<T extends string>(
  key: string,
  allowed: readonly T[],
  initial: T,
  urlParam: string | null,
): [T, Dispatch<SetStateAction<T>>] {
  // Seed with the server-supplied default so SSR + first client paint match.
  const [value, setValue] = useState<T>(initial);
  // Track whether the URL already carried this preference at boot. If yes,
  // we do NOT defer to localStorage on hydration (URL wins).
  const urlHadValueAtBootRef = useRef<boolean>(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let urlValue: T | null = null;
    if (urlParam) {
      try {
        const fromUrl = new URL(window.location.href).searchParams.get(urlParam);
        if (fromUrl && (allowed as readonly string[]).includes(fromUrl)) {
          urlValue = fromUrl as T;
        }
      } catch {
        /* ignore */
      }
    }
    urlHadValueAtBootRef.current = urlValue !== null;
    if (urlValue !== null) {
      // URL wins. If the page rendered with a different initial (e.g.
      // pre-rendered pages can't read query strings at build time), swap
      // here so the deep-link is honoured.
      if (urlValue !== initial) setValue(urlValue);
    } else {
      // No URL hint — fall back to localStorage.
      const stored = readStored(key, allowed, initial);
      if (stored !== initial) setValue(stored);
    }
    // intentionally only on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    // Always mirror the current value to localStorage.
    try {
      window.localStorage.setItem(key, value);
    } catch {
      /* ignore */
    }
    // Mirror to the URL too once the user has either deep-linked OR changed
    // the value at runtime. The very first paint with an unstyled URL leaves
    // the URL clean — only an interaction writes the param.
    if (urlParam) {
      try {
        const url = new URL(window.location.href);
        const hasNow = url.searchParams.get(urlParam) === value;
        if (urlHadValueAtBootRef.current || !hasNow) {
          if (value === initial && !urlHadValueAtBootRef.current) {
            // Keep the URL clean when the value is the default and the user
            // hasn't deep-linked the param.
            url.searchParams.delete(urlParam);
          } else {
            url.searchParams.set(urlParam, value);
            urlHadValueAtBootRef.current = true;
          }
          window.history.replaceState(null, '', url.toString());
        }
      } catch {
        /* ignore — URL update is best-effort */
      }
    }
  }, [key, value, urlParam, initial]);
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
  return window.location.pathname.startsWith('/dev/');
}

// Bare-hex URL: /4040ff, /ff7f50 — i.e. /[hex]. We keep the pathname in
// sync with the input on these routes (clicking a shade row navigates,
// changing the input updates the path). On /colors/[name] and other
// routes we do NOT change the pathname, since /colors/coral is the
// canonical URL even though its content is the same as /ff7f50; rewriting
// it would clobber the SEO-friendly name URL.
const HEX_PATH_RE = /^\/[0-9a-f]{3}$|^\/[0-9a-f]{6}$|^\/[0-9a-f]{8}$/i;
function isHexRoute(): boolean {
  if (typeof window === 'undefined') return false;
  return HEX_PATH_RE.test(window.location.pathname);
}

function syncUrl(hex: Hex) {
  if (typeof window === 'undefined') return;
  try {
    if (isDevHostingRoute()) {
      const url = new URL(window.location.href);
      url.searchParams.set('c', hex.slice(1));
      window.history.replaceState(null, '', url.toString());
    } else if (isHexRoute()) {
      // Preserve search params on the path so ?view=scale survives a
      // hex-input change.
      const url = new URL(window.location.href);
      url.pathname = '/' + hex.slice(1);
      window.history.replaceState(null, '', url.toString());
    }
    // Any other route (home, /colors/[name]) leaves the path alone.
  } catch {
    /* ignore — URL update is best-effort */
  }
}

export interface ShadeToolProps {
  initialHex: Hex;
  /**
   * Preference seeds read from the request URL at SSR time. They MUST match
   * the values the page rendered, so the first client paint does not differ
   * from the server's HTML (otherwise React 19 warns and the layout shifts).
   * Each is optional with a sensible default.
   */
  initialView?: View;
  initialRampMode?: RampMode;
  initialExportFormat?: ExportFormat;
}

export default function ShadeTool({
  initialHex,
  initialView,
  initialRampMode,
  initialExportFormat,
}: ShadeToolProps) {
  return (
    <ToastProvider>
      <ShadeToolInner
        initialHex={initialHex}
        initialView={initialView}
        initialRampMode={initialRampMode}
        initialExportFormat={initialExportFormat}
      />
    </ToastProvider>
  );
}

function ShadeToolInner({
  initialHex,
  initialView = 'ramp',
  initialRampMode = 'oklch',
  initialExportFormat = 'tailwind-v4',
}: ShadeToolProps) {
  const [hex, setHex] = useState<Hex>(() => normalizeHexInput(initialHex));
  const [view, setView] = usePersistedState<View>(
    STORAGE_KEYS.view,
    ['ramp', 'scale'] as const,
    initialView,
    'view',
  );
  const [rampMode, setRampMode] = usePersistedState<RampMode>(
    STORAGE_KEYS.rampMode,
    ['oklch', 'classic'] as const,
    initialRampMode,
    'mode',
  );
  // Copy format is too noisy to put in the URL — every dropdown change would
  // mutate the URL. Keep it localStorage-only.
  const [copyFormat, setCopyFormat] = usePersistedState<CopyFormat>(
    STORAGE_KEYS.copyFormat,
    ['hex', 'rgb', 'hsl', 'oklch', 'cssVar', 'tailwindClass'] as const,
    'hex',
    null,
  );
  const [exportFormat, setExportFormat] = usePersistedState<ExportFormat>(
    STORAGE_KEYS.exportFormat,
    ['tailwind-v4', 'tailwind-v3', 'css-vars', 'w3c-tokens', 'figma-vars'] as const,
    initialExportFormat,
    'fmt',
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
            <Suspense fallback={<TailwindScaleFallback />}>
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
            </Suspense>
          )}
        </section>
      </div>
    </div>
  );
}

/**
 * Height-stable placeholder shown while the lazy TailwindScale chunk loads.
 * Reserves enough vertical space (export preview + dropdown + 11 rows worth)
 * to keep the page from jumping once the chunk finishes (CLS).
 */
function TailwindScaleFallback() {
  // Tailwind's `motion-safe:animate-pulse` skips the pulse when the user
  // has `prefers-reduced-motion: reduce` set. Static placeholders still
  // reserve the same vertical space, so CLS protection is unaffected.
  return (
    <div
      aria-hidden="true"
      className="flex flex-col gap-4"
      style={{ minHeight: '52rem' }}
    >
      <div className="h-8 w-48 rounded bg-neutral-200 motion-safe:animate-pulse dark:bg-neutral-800" />
      <div className="h-64 rounded-md bg-neutral-100 motion-safe:animate-pulse dark:bg-neutral-900" />
      <div className="overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800">
        {Array.from({ length: 11 }).map((_, i) => (
          <div
            key={i}
            className="h-12 border-b border-neutral-100 bg-neutral-50 last:border-b-0 motion-safe:animate-pulse dark:border-neutral-900 dark:bg-neutral-900/40"
          />
        ))}
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
