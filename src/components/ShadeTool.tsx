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
  Shade,
} from '../lib/color/types';
import { parseColor } from '../lib/color/parse';
import { formatForCopy } from '../lib/color/format';
import { oklchRamp } from '../lib/color/ramp';
import { classicRamp } from '../lib/color/classic';
import { buildScale } from '../lib/color/scale';
// Use the slim hex-lookup so the React island doesn't drag the full
// blurb-bearing NAMED_COLORS module into its bundle. The page chrome
// only reads `named.name` and `named.slug` from the result.
import { findByHexSlim as findByHex } from '../lib/data/named-colors-slim';
import ContinuousRamp from './ContinuousRamp';
import { ToastProvider, useToast } from './Toast';
import ColorPicker from './ColorPicker';
import ShareRow from './ShareRow';

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
  dismissedHintBanner: 'shades.dismissedHintBanner',
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
  initialCopyFormat?: CopyFormat;
}

export default function ShadeTool({
  initialHex,
  initialView,
  initialRampMode,
  initialExportFormat,
  initialCopyFormat,
}: ShadeToolProps) {
  return (
    <ToastProvider>
      <ShadeToolInner
        initialHex={initialHex}
        initialView={initialView}
        initialRampMode={initialRampMode}
        initialExportFormat={initialExportFormat}
        initialCopyFormat={initialCopyFormat}
      />
    </ToastProvider>
  );
}

function ShadeToolInner({
  initialHex,
  initialView = 'ramp',
  initialRampMode = 'oklch',
  initialExportFormat = 'tailwind-v4',
  initialCopyFormat = 'hex',
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
  const [copyFormat, setCopyFormat] = usePersistedState<CopyFormat>(
    STORAGE_KEYS.copyFormat,
    ['hex', 'oklch', 'rgb', 'hsl', 'cssVar', 'tailwindClass'] as const,
    initialCopyFormat,
    'copy',
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

  // Copy-success toasts are fired by ShadeRow / ExportDropdown themselves —
  // they're the only places that know whether the underlying clipboard write
  // actually resolved.
  const handleCopyShade = useCallback((_h: Hex) => {}, []);

  // Inline tip banner shown at the top of the shades column. Hidden by
  // default during SSR + first paint to keep hydration deterministic, then
  // revealed post-mount if the user has not yet dismissed it.
  const [showHintBanner, setShowHintBanner] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const dismissed =
        window.localStorage.getItem(STORAGE_KEYS.dismissedHintBanner) === 'true';
      if (!dismissed) setShowHintBanner(true);
    } catch {
      setShowHintBanner(true);
    }
  }, []);
  const dismissHintBanner = useCallback(() => {
    setShowHintBanner(false);
    try {
      window.localStorage.setItem(STORAGE_KEYS.dismissedHintBanner, 'true');
    } catch {
      /* ignore */
    }
  }, []);

  // Update in place instead of full navigation. The `hex` effect calls
  // syncUrl which rewrites the path on /[hex] routes, so the URL still
  // updates — just without reloading the page. Mirrors the color-picker
  // flow so the arrow link behaves the same as the top-left color box.
  const handleNavigate = useCallback((h: Hex) => {
    setHex(h);
  }, []);

  const handleExportCopy = useCallback((_text: string) => {
    // intentionally no-op; ExportDropdown owns the toast
  }, []);

  return (
    <div className="text-ink">
      {/* Mobile sticky header: visible only < lg */}
      <div className="sticky top-0 z-30 border-b border-hairline bg-paper/90 backdrop-blur md:hidden">
        <div className="flex items-center gap-3 px-4 py-3">
          <div
            aria-hidden="true"
            className="h-10 w-10 shrink-0 rounded-sm ring-1 ring-ink/10"
            style={{ backgroundColor: hex }}
          />
          <div className="min-w-0 flex-1">
            <div className="truncate font-mono text-sm tracking-tight">{hex}</div>
            {named && (
              <div className="truncate font-display text-sm text-mute">{named.name}</div>
            )}
          </div>
        </div>
      </div>

      <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-8 md:grid-cols-[5fr_7fr] lg:gap-14 lg:px-8 lg:py-12">
        {/* Left rail: preview + input + controls (sticky on desktop) */}
        <aside className="hidden md:block md:sticky md:top-8 md:self-start">
          <PreviewBlock hex={hex} named={named} onChange={handleChangeHex} />
          <div className="mt-6 flex flex-col gap-5">
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
            <ShareRow hex={hex} named={named} />
          </div>
        </aside>

        {/* Right column: ramp or scale + view/mode toggles on mobile */}
        <section className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 md:hidden">
            <ViewToggle view={view} onChange={setView} />
            {view === 'ramp' && (
              <RampModeToggle mode={rampMode} onChange={setRampMode} />
            )}
            <CopyFormatPicker
              value={copyFormat}
              onChange={setCopyFormat}
              hasStop={view === 'scale'}
            />
            <ShareRow hex={hex} named={named} />
          </div>

          <div className={`flex items-center justify-between gap-4${view === 'scale' ? ' border-b border-hairline pb-2' : ''}`}>
            {view === 'ramp' ? (
              <span className="eyebrow">Tints and Shades</span>
            ) : (
              <span className="eyebrow">Scale</span>
            )}
            <div className="flex items-center gap-3">
              <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-mute">
                {view === 'ramp' ? `${ramp.shades.length} stops · ${ramp.mode}` : `11 stops · anchor ${scale.anchorStop}`}
              </span>
              <span aria-hidden="true" className="font-mono text-[11px] text-mute">·</span>
              {view === 'ramp' ? (
                <DownloadPngButton
                  shades={ramp.shades}
                  sourceHex={hex}
                  variant={ramp.mode}
                  subject="ramp"
                />
              ) : (
                <DownloadPngButton
                  shades={scale.shades}
                  sourceHex={hex}
                  variant="scale"
                  subject="scale"
                />
              )}
            </div>
          </div>

          <div className="flex flex-col gap-2.5">
            {showHintBanner && <HintBanner onDismiss={dismissHintBanner} />}
            {view === 'ramp' ? (
              <ContinuousRamp
                ramp={ramp}
                sourceHex={hex}
                copyFormat={copyFormat}
                brandName={brandName}
                onCopy={handleCopyShade}
                onNavigate={handleNavigate}
              />
            ) : (
              <Suspense fallback={<TailwindScaleFallback />}>
                <TailwindScale
                  scale={scale}
                  sourceHex={hex}
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
          </div>
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

/**
 * "Download PNG" button shared by the ramp and scale views. The drawing
 * module is dynamically imported on click so the canvas code stays out of the
 * eager ramp chunk (see `src/lib/exports/ramp-png.ts`). `subject` names the
 * palette for the accessible label; `variant` tags the download filename.
 */
function DownloadPngButton({
  shades,
  sourceHex,
  variant,
  subject,
}: {
  shades: Shade[];
  sourceHex: Hex;
  variant: string;
  subject: string;
}) {
  const { pushToast } = useToast();
  const [busy, setBusy] = useState(false);

  const handleClick = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    // Surface progress in the shared bottom-right toast (same place as the
    // "Copied" feedback) rather than mutating the button label.
    pushToast('Preparing…');
    try {
      const { downloadRampPng } = await import('../lib/exports/ramp-png');
      await downloadRampPng({ shades, sourceHex, variant });
    } catch {
      pushToast("Couldn't generate the PNG in this browser.");
    } finally {
      setBusy(false);
    }
  }, [busy, shades, sourceHex, variant, pushToast]);

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      aria-label={`Download ${subject} as PNG`}
      className={
        'inline-flex shrink-0 items-center gap-1.5 border border-ink/20 px-2.5 py-1 ' +
        'font-mono text-[11px] uppercase tracking-[0.16em] text-ink ' +
        'transition-colors duration-200 ease-out hover:border-ink/40 hover:bg-paper-2 ' +
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ' +
        'disabled:cursor-default disabled:opacity-60'
      }
    >
      <DownloadIcon className="h-3.5 w-3.5" />
      PNG
    </button>
  );
}

function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className={className ?? 'h-4 w-4'}>
      <path
        d="M8 1.5v8m0 0L5 6.5m3 3 3-3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M2.5 11v1.5A1.5 1.5 0 0 0 4 14h8a1.5 1.5 0 0 0 1.5-1.5V11"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function PreviewBlock({
  hex,
  named,
  onChange,
}: {
  hex: Hex;
  named: ReturnType<typeof findByHex>;
  onChange: (next: Hex) => void;
}) {
  const oklchString = useMemo(() => formatForCopy(hex, 'oklch'), [hex]);
  const rgbString = useMemo(() => formatForCopy(hex, 'rgb'), [hex]);
  const hslString = useMemo(() => formatForCopy(hex, 'hsl'), [hex]);

  // Stacked layers for the swatch cross-fade. Each color change pushes a new
  // layer that starts at opacity 0 and animates to 1; older layers stay
  // beneath it until the transition ends, then they're swept away.
  const [layers, setLayers] = useState<{ id: number; hex: Hex; visible: boolean }[]>(
    () => [{ id: 0, hex, visible: true }],
  );
  const layerIdRef = useRef(0);
  const topHexRef = useRef<Hex>(hex);
  useEffect(() => {
    if (topHexRef.current === hex) return;
    topHexRef.current = hex;
    layerIdRef.current += 1;
    const id = layerIdRef.current;
    setLayers((prev) => [...prev, { id, hex, visible: false }]);
    const sweep = window.setTimeout(() => {
      setLayers((prev) => prev.filter((l) => l.id === id));
    }, 360);
    return () => {
      window.clearTimeout(sweep);
    };
  }, [hex]);
  // Flipping a freshly-added layer from opacity:0 to opacity:1 must happen
  // AFTER the browser has painted the opacity:0 state — otherwise React
  // batches both updates into one commit, the browser paints once at
  // opacity:1, and the CSS transition has no start→end delta to animate
  // (the cross-fade silently collapses). `useEffect` is documented to run
  // after paint, so a separate effect that watches `layers` and flips any
  // not-yet-visible entry gives the transition a real delta. The picker
  // drag historically masked this because rapid onChange spam piled up new
  // layers over a still-visible base; a single shade-row click exposed it.
  useEffect(() => {
    const pending = layers.find((l) => !l.visible);
    if (!pending) return;
    setLayers((prev) =>
      prev.map((l) => (l.id === pending.id ? { ...l, visible: true } : l)),
    );
  }, [layers]);

  // Local text mirrors what the user is typing in the always-visible input
  // next to the swatch trigger. Synced from `hex` only when the parent
  // value changes from outside (popover pick, shade-row click, navigation),
  // so an in-progress typed value like "rgb(64" isn't clobbered.
  const [inputText, setInputText] = useState<string>(hex);
  useEffect(() => {
    let derived: Hex | null = null;
    try {
      derived = parseColor(inputText);
    } catch {
      /* unparseable — fall through and sync */
    }
    if (derived !== hex) setInputText(hex);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hex]);

  const handleTextChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      setInputText(raw);
      try {
        onChange(parseColor(raw));
      } catch {
        /* partial / invalid — wait for more keystrokes */
      }
    },
    [onChange],
  );

  const handleTextBlur = useCallback(() => {
    try {
      parseColor(inputText);
    } catch {
      setInputText(hex);
    }
  }, [inputText, hex]);

  // Select-all on click/focus so the user can immediately retype or paste a
  // new value. `onFocus` covers keyboard tab-in; for a mouse click the
  // browser places the caret on `mouseup` *after* focus, which clears the
  // focus-time selection — so we flag the focusing click and `preventDefault`
  // its `mouseup` to keep the selection. The flag clears after that first
  // click, so subsequent drag-to-select inside the field still works.
  const focusingClickRef = useRef(false);
  const handleTextFocus = useCallback((e: React.FocusEvent<HTMLInputElement>) => {
    focusingClickRef.current = true;
    e.currentTarget.select();
  }, []);
  const handleTextMouseUp = useCallback((e: React.MouseEvent<HTMLInputElement>) => {
    if (focusingClickRef.current) {
      e.preventDefault();
      focusingClickRef.current = false;
    }
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex h-[60px] w-full bg-paper-2">
        <ColorPicker
          hex={hex}
          onChange={onChange}
          triggerLabel={`Color ${hex} — open color picker`}
          className="block h-full w-1/4 shrink-0"
        >
          <span
            title="Pick a color"
            className="relative flex h-[60px] w-full items-center justify-center overflow-hidden"
          >
            {layers.map((l) => (
              <span
                key={l.id}
                aria-hidden="true"
                className="absolute inset-0 transition-opacity duration-300 ease-out motion-reduce:transition-none"
                style={{ backgroundColor: l.hex, opacity: l.visible ? 1 : 0 }}
              />
            ))}
            <span className="relative inline-flex h-10 w-10 items-center justify-center rounded-full bg-paper/85 text-ink ring-1 ring-ink/15 shadow-sm transition-transform duration-150 ease-out group-hover:scale-110 group-focus-visible:scale-110 motion-reduce:transition-none motion-reduce:group-hover:scale-100 motion-reduce:group-focus-visible:scale-100">
              <PickerIcon className="h-5 w-5" />
            </span>
          </span>
        </ColorPicker>
        <input
          type="text"
          value={inputText}
          onChange={handleTextChange}
          onBlur={handleTextBlur}
          onFocus={handleTextFocus}
          onMouseUp={handleTextMouseUp}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          aria-label="Color value (hex, rgb, hsl, oklch, or name)"
          placeholder="#4040ff · coral · rgb(64 64 255)"
          className="h-full flex-1 bg-transparent px-4 font-mono text-xl tracking-tight text-ink placeholder:text-mute focus:outline-none"
        />
      </div>
      {named && (
        <div className="border-b border-hairline pb-2">
          <span className="font-display text-base text-ink-2">{named.name}</span>
        </div>
      )}
      <div className="flex flex-col">
        <CopyableValueRow label="HEX" value={hex} />
        <CopyableValueRow label="OKLCH" value={oklchString} />
        <CopyableValueRow label="RGB" value={rgbString} />
        <CopyableValueRow label="HSL" value={hslString} />
      </div>
    </div>
  );
}

function CopyableValueRow({ label, value }: { label: string; value: string }) {
  const { pushToast } = useToast();
  const [copied, setCopied] = useState(false);
  const copiedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (copiedTimeoutRef.current) clearTimeout(copiedTimeoutRef.current);
    },
    [],
  );

  const handleCopy = useCallback(() => {
    if (
      typeof navigator === 'undefined' ||
      !navigator.clipboard ||
      typeof navigator.clipboard.writeText !== 'function'
    ) {
      pushToast("Couldn't copy — clipboard is unavailable in this browser.");
      return;
    }
    navigator.clipboard.writeText(value).then(
      () => {
        setCopied(true);
        if (copiedTimeoutRef.current) clearTimeout(copiedTimeoutRef.current);
        copiedTimeoutRef.current = setTimeout(() => setCopied(false), 1500);
      },
      () => {
        pushToast("Couldn't copy — check browser permissions.");
      },
    );
  }, [value, pushToast]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleCopy();
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleCopy}
      onKeyDown={handleKeyDown}
      aria-label={`Copy ${label} value`}
      className="-mx-2 flex cursor-pointer items-center justify-end gap-2 rounded-sm px-2 py-1 transition-colors duration-200 ease-out hover:bg-paper-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
    >
      {copied && (
        <span className="rounded-sm bg-black px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-white">
          Copied
        </span>
      )}
      <span className="font-mono text-sm tracking-tight text-ink">{value}</span>
      <span aria-hidden="true" className="inline-flex h-6 w-6 items-center justify-center text-mute">
        <CopyIcon className="h-3.5 w-3.5" />
      </span>
    </div>
  );
}

function HintBanner({ onDismiss }: { onDismiss: () => void }) {
  return (
    <button
      type="button"
      aria-label="Dismiss tip: double-click a shade to use as your new source"
      onClick={onDismiss}
      className="group flex w-full items-center justify-between gap-3 bg-black px-3.5 py-2 text-left text-sm text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
    >
      <span>
        <span className="mr-2 font-mono text-[11px] uppercase tracking-[0.16em] text-white/60">
          Tip
        </span>
        Double-click a shade to use as your new source.
      </span>
      <span
        aria-hidden="true"
        className="-mr-1 inline-flex h-6 w-6 shrink-0 items-center justify-center text-white/70 transition-transform duration-150 ease-out group-hover:scale-150 group-hover:text-white group-focus-visible:scale-150 group-focus-visible:text-white motion-reduce:transition-none"
      >
        <svg viewBox="0 0 16 16" className="h-4 w-4">
          <path
            d="M3 3l10 10M13 3L3 13"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </span>
    </button>
  );
}

function CopyIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className={className ?? 'h-4 w-4'}>
      <rect x="4" y="4" width="9" height="10" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3 11V3.5A1.5 1.5 0 0 1 4.5 2H11" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function PickerIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className={className ?? 'h-4 w-4'}>
      <path d="M11.2 1.6a2.2 2.2 0 0 1 3.1 3.1l-1.4 1.4-3.1-3.1 1.4-1.4Z" fill="currentColor"/>
      <path d="m9.1 3.7 3.1 3.1-6.6 6.6-3.1-.5L2 9.8 9.1 3.7Z" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round"/>
    </svg>
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
      <div className="flex items-center gap-2">
        <span className="eyebrow">Algorithm</span>
        <AlgorithmInfoButton />
      </div>
      <div
        role="tablist"
        aria-label="Ramp algorithm"
        className="relative inline-grid w-full grid-cols-2 rounded-full bg-paper-2 p-1 ring-1 ring-ink/10"
      >
        {/* Sliding indicator */}
        <span
          aria-hidden="true"
          className={[
            'absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-full bg-ink shadow-sm',
            'transition-transform duration-200 ease-out motion-reduce:transition-none',
            mode === 'classic' ? 'translate-x-full' : 'translate-x-0',
          ].join(' ')}
        />
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
                'relative z-10 rounded-full px-4 py-2 text-sm font-medium tracking-tight',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60',
                active ? 'text-paper' : 'text-ink/70 hover:text-ink',
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

function AlgorithmInfoButton() {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const id = 'algorithm-info-popover';

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: globalThis.MouseEvent) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative inline-flex">
      <button
        type="button"
        aria-label="About these algorithms"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(o => !o)}
        className={
          'inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] ' +
          'font-semibold leading-none text-mute ring-1 ring-ink/20 ' +
          'hover:text-ink hover:ring-ink/40 ' +
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60'
        }
      >
        ?
      </button>
      {open && (
        <div
          id={id}
          role="dialog"
          aria-label="Algorithm info"
          className={
            'absolute left-0 top-full z-40 mt-2 w-72 max-w-[calc(100vw-2rem)] ' +
            'border border-hairline bg-paper p-3 text-xs leading-relaxed text-ink ' +
            'shadow-[0_10px_30px_rgba(17,17,16,0.12)]'
          }
        >
          <p className="mb-2">
            <span className="font-mono font-semibold">OKLCH</span> walks the ramp in a
            perceptually uniform color space. Lightness steps feel evenly spaced and
            chroma stays controlled, so mid-tones don't go muddy. Use this for new
            design systems.
          </p>
          <p>
            <span className="font-mono font-semibold">Classic</span> reproduces the
            0to255-style RGB walk that older palette tools and Tailwind scales use —
            channels step by 17 toward white, then walk down toward black. Pick this
            when you need to match shades from assets built with those older tools.
          </p>
        </div>
      )}
    </div>
  );
}

const COPY_FORMAT_LABELS: Record<CopyFormat, string> = {
  hex: 'hex',
  oklch: 'oklch()',
  rgb: 'rgb()',
  hsl: 'hsl()',
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
  const formats = (Object.keys(COPY_FORMAT_LABELS) as CopyFormat[]).filter(k => {
    const requiresStop = k === 'cssVar' || k === 'tailwindClass';
    return !(requiresStop && !hasStop);
  });
  // Tailwind-scale view has 6 formats — too many to fit in a single pill
  // row at readable sizes, so render a dropdown there. The continuous-ramp
  // view only has 4 short formats and stays as a single-row segmented
  // control.
  if (formats.length > 4) {
    return (
      <label className="flex flex-col gap-2 text-base">
        <span className="eyebrow">Copy as</span>
        {/* `appearance-none` strips the native control chrome so the box can
            match the Download button (hairline border, paper-2 hover, accent
            focus); the chevron below is our own, overlaid and non-interactive.
            The option popup itself can't be styled without JS — that's fine. */}
        <div className="relative">
          <select
            value={value}
            onChange={(e) => onChange(e.target.value as CopyFormat)}
            className={
              'w-full appearance-none border border-ink/20 bg-paper-2 py-2.5 pl-3 pr-9 ' +
              'font-mono text-sm text-ink transition-colors duration-150 ease-out ' +
              'motion-reduce:transition-none ' +
              'focus-visible:outline-none focus-visible:border-accent ' +
              'focus-visible:ring-2 focus-visible:ring-accent/30'
            }
          >
            {formats.map(k => (
              <option key={k} value={k}>
                {COPY_FORMAT_LABELS[k]}
              </option>
            ))}
          </select>
          <svg
            aria-hidden="true"
            viewBox="0 0 16 16"
            className="pointer-events-none absolute right-3 top-1/2 h-[1.2rem] w-[1.2rem] -translate-y-1/2 text-mute"
          >
            <path
              d="M4 6.5 8 10.5l4-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            />
          </svg>
        </div>
      </label>
    );
  }
  const activeIndex = Math.max(0, formats.indexOf(value));
  return (
    <div className="flex flex-col gap-2">
      <span className="eyebrow">Copy as</span>
      <div
        role="tablist"
        aria-label="Copy format"
        className="relative grid grid-cols-4 gap-1 rounded-full bg-paper-2 p-1 ring-1 ring-ink/10"
      >
        {/* Sliding indicator — matches the Algorithm toggle pattern.
            Pill width equals one column; translateX by (100% + gap) per step.
            p-1 = 0.25rem, gap-1 = 0.25rem → 4-col inner is (100% - 1.25rem)/4. */}
        <span
          aria-hidden="true"
          className="absolute inset-y-1 left-1 rounded-full bg-ink shadow-sm transition-transform duration-200 ease-out motion-reduce:transition-none"
          style={{
            width: 'calc((100% - 1.25rem) / 4)',
            transform: `translateX(calc(${activeIndex} * (100% + 0.25rem)))`,
          }}
        />
        {formats.map(k => {
          const active = value === k;
          return (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(k)}
              className={[
                'relative z-10 min-w-0 rounded-full px-2 py-1.5 text-center font-mono text-xs tracking-tight whitespace-nowrap',
                'transition-colors duration-150 motion-reduce:transition-none',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60',
                active ? 'text-paper' : 'text-ink/70 hover:text-ink',
              ].join(' ')}
            >
              {COPY_FORMAT_LABELS[k]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
