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
import { parseColor, toOklch } from '../lib/color/parse';
import { oklchRamp } from '../lib/color/ramp';
import { classicRamp } from '../lib/color/classic';
import { buildScale } from '../lib/color/scale';
// Use the slim hex-lookup so the React island doesn't drag the full
// blurb-bearing NAMED_COLORS module into its bundle. The page chrome
// only reads `named.name` and `named.slug` from the result.
import { findByHexSlim as findByHex } from '../lib/data/named-colors-slim';
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

  // Honor `?seed=<raw>` from the URL on mount: this is the home form's
  // hand-off path for inputs it can't resolve locally (rgb/hsl/oklch/typo).
  // We try parseColor; on success we swap to that hex and strip the param.
  // On failure we leave the URL's `initialHex` showing and toast.
  // Runs ONCE on mount; deps intentionally empty.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let raw: string | null = null;
    try {
      raw = new URL(window.location.href).searchParams.get('seed');
    } catch {
      return;
    }
    if (!raw) return;
    const decoded = (() => {
      try {
        return decodeURIComponent(raw);
      } catch {
        return raw as string;
      }
    })();
    // Always strip the param after consuming it — we don't want a refresh
    // to keep re-parsing or to leak the raw input into shared URLs.
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('seed');
      window.history.replaceState(null, '', url.toString());
    } catch {
      /* ignore */
    }
    try {
      const parsed = parseColor(decoded);
      if (parsed !== hex) setHex(parsed);
    } catch {
      pushToast(`Couldn't parse "${decoded}" — showing #4040ff instead.`);
    }
  }, []);

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

  // Copy-success toasts are now fired by ShadeRow / ExportDropdown
  // themselves — they're the only places that know whether the underlying
  // clipboard write actually resolved. We keep these callbacks as hooks for
  // any future "this row was just copied" analytics, but they no longer
  // double-fire a toast.
  const handleCopyShade = useCallback((_h: Hex) => {
    // intentionally no-op; row owns the toast
  }, []);

  const handleNavigate = useCallback((h: Hex) => {
    if (typeof window !== 'undefined') {
      window.location.href = '/' + h.slice(1);
    }
  }, []);

  const handleExportCopy = useCallback((_text: string) => {
    // intentionally no-op; ExportDropdown owns the toast
  }, []);

  return (
    <div className="text-ink">
      {/* Mobile sticky header: visible only < lg */}
      <div className="sticky top-0 z-30 border-b border-hairline bg-paper/90 backdrop-blur lg:hidden">
        <div className="flex items-center gap-3 px-4 py-3">
          <div
            aria-hidden="true"
            className="h-10 w-10 shrink-0 rounded-sm ring-1 ring-ink/10"
            style={{ backgroundColor: hex }}
          />
          <div className="min-w-0 flex-1">
            <div className="truncate font-mono text-sm tracking-tight">{hex}</div>
            {named && (
              <div className="truncate font-display italic text-sm text-mute">{named.name}</div>
            )}
          </div>
        </div>
        <div className="px-4 pb-3">
          <ColorInput value={hex} onChange={handleChangeHex} />
        </div>
      </div>

      <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-8 lg:grid-cols-[5fr_7fr] lg:gap-14 lg:px-8 lg:py-12">
        {/* Left rail: preview + input + controls (sticky on desktop) */}
        <aside className="hidden lg:block lg:sticky lg:top-8 lg:self-start">
          <PreviewBlock hex={hex} named={named} />
          <div className="mt-6 flex flex-col gap-5">
            <ColorInput value={hex} onChange={handleChangeHex} />

            <div className="border-t border-hairline pt-5">
              <ViewToggle view={view} onChange={setView} />
            </div>

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

          <div className="flex items-baseline justify-between border-b border-hairline pb-2">
            <span className="eyebrow">{view === 'ramp' ? 'Shades' : 'Scale'}</span>
            <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-mute">
              {view === 'ramp' ? `${ramp.shades.length} stops · ${ramp.mode}` : `11 stops · anchor ${scale.anchorStop}`}
            </span>
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
  return (
    <div
      aria-hidden="true"
      className="flex flex-col gap-4"
      style={{ minHeight: '52rem' }}
    >
      <div className="h-8 w-48 bg-paper-2 motion-safe:animate-pulse" />
      <div className="h-64 bg-paper-2 motion-safe:animate-pulse" />
      <div className="overflow-hidden border-y border-hairline">
        {Array.from({ length: 11 }).map((_, i) => (
          <div
            key={i}
            className="h-12 border-b border-hairline-2 bg-paper-2/60 last:border-b-0 motion-safe:animate-pulse"
          />
        ))}
      </div>
    </div>
  );
}

function PreviewBlock({ hex, named }: { hex: Hex; named: ReturnType<typeof findByHex> }) {
  // OKLCH coordinates for the metadata strip below the swatch — gives the
  // page chrome a "data sheet" feel without competing with the color block.
  const oklchTriple = useMemo(() => {
    try {
      return toOklch(hex);
    } catch {
      return null;
    }
  }, [hex]);
  return (
    <div className="flex flex-col gap-4">
      <div
        role="img"
        aria-label={`Color ${hex}`}
        className="aspect-[5/6] w-full ring-1 ring-ink/10"
        style={{ backgroundColor: hex }}
      />
      <div className="flex items-baseline justify-between border-b border-hairline pb-2">
        <span className="font-mono text-sm tracking-tight text-ink">{hex}</span>
        {named && (
          <span className="font-display italic text-base text-ink-2">{named.name}</span>
        )}
      </div>
      {oklchTriple && Number.isFinite(oklchTriple.l) && (
        <dl className="grid grid-cols-3 gap-4 font-mono text-[11px] uppercase tracking-[0.14em] text-mute">
          <div>
            <dt>L</dt>
            <dd className="mt-1 text-base normal-case tracking-tight text-ink">
              {oklchTriple.l.toFixed(3)}
            </dd>
          </div>
          <div>
            <dt>C</dt>
            <dd className="mt-1 text-base normal-case tracking-tight text-ink">
              {oklchTriple.c.toFixed(3)}
            </dd>
          </div>
          <div>
            <dt>H</dt>
            <dd className="mt-1 text-base normal-case tracking-tight text-ink">
              {Number.isFinite(oklchTriple.h) ? `${oklchTriple.h.toFixed(0)}°` : '—'}
            </dd>
          </div>
        </dl>
      )}
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
  // Underline-tab style — Linear / editorial.
  return (
    <div role="tablist" aria-label="View" className="flex gap-6">
      {(['ramp', 'scale'] as const).map(v => {
        const active = view === v;
        return (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={active}
            aria-label={v === 'ramp' ? 'Continuous ramp' : 'Tailwind scale'}
            onClick={() => onChange(v)}
            className={[
              'relative -mb-px py-2 text-sm font-medium tracking-tight',
              'focus-visible:outline-none',
              active
                ? 'text-ink after:absolute after:inset-x-0 after:-bottom-px after:h-[2px] after:bg-accent'
                : 'text-mute hover:text-ink',
            ].join(' ')}
          >
            {v === 'ramp' ? 'Continuous ramp' : 'Tailwind scale'}
          </button>
        );
      })}
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
    <div className="flex flex-col gap-2">
      <span className="eyebrow">Algorithm</span>
      <div
        role="tablist"
        aria-label="Ramp algorithm"
        className="inline-flex border border-ink/20"
      >
        {(['oklch', 'classic'] as const).map(m => {
          const active = mode === m;
          return (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(m)}
              className={[
                'px-3 py-1.5 text-xs font-medium tracking-tight',
                'focus-visible:outline-none focus-visible:bg-accent-soft',
                active
                  ? 'bg-ink text-paper'
                  : 'bg-paper text-ink/70 hover:bg-paper-2',
              ].join(' ')}
            >
              {m === 'oklch' ? 'OKLCH' : 'Classic'}
            </button>
          );
        })}
      </div>
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
    <label className="flex items-center gap-3 text-sm">
      <span className="eyebrow shrink-0">Copy as</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as CopyFormat)}
        className={
          'min-w-0 flex-1 border border-ink/15 bg-paper px-2 py-1 font-mono text-xs text-ink ' +
          'focus-visible:outline-none focus-visible:border-accent'
        }
      >
        {(Object.keys(COPY_FORMAT_LABELS) as CopyFormat[]).map(k => {
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
