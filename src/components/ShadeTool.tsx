import {
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
  Shade,
} from '../lib/color/types';
import { parseColor } from '../lib/color/parse';
import { formatForCopy } from '../lib/color/format';
import { oklchRamp } from '../lib/color/ramp';
import { buildScale } from '../lib/color/scale';
// Use the slim hex-lookup so the React island doesn't drag the full
// blurb-bearing NAMED_COLORS module into its bundle. The page chrome
// only reads `named.name` and `named.slug` from the result.
import { findByHexSlim as findByHex } from '../lib/data/named-colors-slim';
import ContinuousRamp from './ContinuousRamp';
import { ToastProvider, useToast } from './Toast';
import ColorPicker from './ColorPicker';
import ShareRow from './ShareRow';

// The Tailwind scale is the default view, so its grid ships eagerly and is
// server-rendered — real content on first paint, no skeleton flash. Only the
// heaviest leaf (the export-dropdown UI plus the five export-format
// serializers) stays lazy, split out *inside* `TailwindScale` behind a small
// height-stable fallback. The OKLCH continuous ramp is eager too — it just
// reuses the shared `ShadeRow` — so toggling between the two views is instant.
import TailwindScale from './TailwindScale';

/**
 * Top-level React island for the shade tool.
 *
 * Owns:
 *   - current hex (URL-synced)
 *   - view selection (Tailwind scale vs OKLCH ramp; default Tailwind) —
 *     persisted in localStorage and mirrored to `?view=scale|ramp`
 *   - copy-format preference — persisted in localStorage
 *   - export-format preference — persisted in localStorage
 *
 * URL sync: each new hex calls `history.replaceState` to update the path.
 * On the development page (`/_dev/tool`) we update the `?c=` search param
 * instead so a refresh doesn't drop the user onto the real route while
 * the wave-2b pages are being built in parallel.
 */

const STORAGE_KEYS = {
  copyFormat: 'shades.copyFormat',
  exportFormat: 'shades.exportFormat',
  view: 'shades.view',
  dismissedHintBanner: 'shades.dismissedHintBanner',
  // Last-used color, written on every hex change and re-seeded on the root
  // route after hydration (see the mount handler + the `hex` effect below).
  hex: 'uishades:hex',
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
  // Becomes true only when the value changes through the wrapped setter
  // returned below (a real user interaction). The localStorage restore on
  // mount uses the raw `setValue`, so it does NOT count as interaction — that
  // keeps an already-clean URL (e.g. `/`) clean for returning visitors instead
  // of dirtying it with a `?view=`/`?fmt=` derived from their stored pref.
  const hasInteractedRef = useRef<boolean>(false);
  const setValueAndMark = useCallback<Dispatch<SetStateAction<T>>>((next) => {
    hasInteractedRef.current = true;
    setValue(next);
  }, []);
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
    if (!urlParam) return;
    // Only touch the URL once the user has deep-linked the param OR changed
    // the value through an interaction. A localStorage restore on mount must
    // NOT dirty a clean URL — otherwise a returning visitor whose stored pref
    // differs from the default would land on `/?view=…` with no interaction.
    if (!urlHadValueAtBootRef.current && !hasInteractedRef.current) return;
    try {
      const url = new URL(window.location.href);
      const current = url.searchParams.get(urlParam);
      if (value === initial && !urlHadValueAtBootRef.current) {
        // Back to the default and not deep-linked → keep the URL clean.
        if (current !== null) {
          url.searchParams.delete(urlParam);
          window.history.replaceState(null, '', url.toString());
        }
      } else if (current !== value) {
        url.searchParams.set(urlParam, value);
        urlHadValueAtBootRef.current = true;
        window.history.replaceState(null, '', url.toString());
      }
    } catch {
      /* ignore — URL update is best-effort */
    }
  }, [key, value, urlParam, initial]);
  return [value, setValueAndMark];
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

// `userChose` gates ONLY the root-route branch: the home page paints the
// seed/last-used color before any interaction, and we must NOT rewrite `/` to
// `/[hex]` for that post-hydration swap (the URL should stay clean until the
// user actually picks a color). It does NOT gate the `isHexRoute()` branch —
// a direct visit to `/ff7f50` must keep its path synced regardless.
function syncUrl(hex: Hex, userChose: boolean) {
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
    } else if (window.location.pathname === '/' && userChose) {
      // Root route, after a user-initiated change: promote `/` to `/[hex]`
      // so the URL is shareable. Mirror the isHexRoute branch's URL build to
      // preserve any existing search params. Subsequent syncs match
      // isHexRoute() above and reuse that branch automatically.
      const url = new URL(window.location.href);
      url.pathname = '/' + hex.slice(1);
      window.history.replaceState(null, '', url.toString());
    }
    // Any other route (/colors/[name], or root before interaction) leaves the
    // path alone.
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
  initialExportFormat?: ExportFormat;
  initialCopyFormat?: CopyFormat;
}

export default function ShadeTool({
  initialHex,
  initialView,
  initialExportFormat,
  initialCopyFormat,
}: ShadeToolProps) {
  return (
    <ToastProvider>
      <ShadeToolInner
        initialHex={initialHex}
        initialView={initialView}
        initialExportFormat={initialExportFormat}
        initialCopyFormat={initialCopyFormat}
      />
    </ToastProvider>
  );
}

function ShadeToolInner({
  initialHex,
  initialView = 'scale',
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

  // Tracks whether the current hex resulted from a user-initiated change
  // (picker, text input, shade-row navigation, or an explicit `?hex=` deep
  // link). It gates the root-route URL rewrite in `syncUrl`: the post-
  // hydration localStorage seed-swap on `/` leaves this false so the URL
  // stays clean, while the first real interaction flips it true so `/` is
  // promoted to `/[hex]`. Refs are not reactive — read `.current` at fire
  // time, never in a deps array.
  const userChoseRef = useRef(false);

  // Mount handler for the URL/last-used color hand-off. Runs ONCE on mount;
  // deps intentionally empty. Precedence (highest first):
  //   1. `?hex=<raw>` — explicit deep link (replaces the old home form). On
  //      success this IS a user intent, so we flip userChoseRef and let the
  //      path rewrite to /[hex]. `?hex=` wins if both params appear.
  //   2. `?seed=<raw>` — the legacy home-form hand-off for inputs it can't
  //      resolve locally (rgb/hsl/oklch/typo). Does NOT flip userChoseRef,
  //      so its URL behavior is unchanged from before.
  //   3. localStorage['uishades:hex'] — last-used color, but ONLY on the root
  //      route and ONLY when neither param is present. No URL rewrite (the
  //      gate stays false), so SSR's clean `/` is preserved.
  //   4. (implicit) the SSR `initialHex` already in state — nothing to do.
  // Both params are always stripped after consumption so a refresh doesn't
  // re-parse and shared URLs don't leak the raw input.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let rawHex: string | null = null;
    let rawSeed: string | null = null;
    try {
      const params = new URL(window.location.href).searchParams;
      rawHex = params.get('hex');
      rawSeed = params.get('seed');
    } catch {
      return;
    }

    const decode = (raw: string): string => {
      try {
        return decodeURIComponent(raw);
      } catch {
        return raw;
      }
    };
    const stripParams = () => {
      try {
        const url = new URL(window.location.href);
        url.searchParams.delete('hex');
        url.searchParams.delete('seed');
        window.history.replaceState(null, '', url.toString());
      } catch {
        /* ignore */
      }
    };

    if (rawHex) {
      // 1. Explicit `?hex=` deep link — user intent, so promote to /[hex].
      const decoded = decode(rawHex);
      // Strip both params before the hex-effect runs so the rewritten path
      // doesn't carry ?hex= along.
      stripParams();
      try {
        const parsed = parseColor(decoded);
        userChoseRef.current = true;
        if (parsed !== hex) setHex(parsed);
      } catch {
        pushToast(`Couldn't parse "${decoded}" — showing ${hex} instead.`);
      }
      return;
    }

    if (rawSeed) {
      // 2. Legacy `?seed=` hand-off. Behavior unchanged — does NOT flip the
      // user-choice gate.
      const decoded = decode(rawSeed);
      stripParams();
      try {
        const parsed = parseColor(decoded);
        if (parsed !== hex) setHex(parsed);
      } catch {
        pushToast(`Couldn't parse "${decoded}" — showing ${hex} instead.`);
      }
      return;
    }

    // 3. No param — on the root route, seed the last-used color from
    // localStorage. This swap happens post-hydration (SSR painted the
    // initialHex), and because the gate stays false the URL stays at `/`.
    if (window.location.pathname === '/') {
      try {
        const stored = window.localStorage.getItem(STORAGE_KEYS.hex);
        if (stored) {
          const parsed = parseColor(stored);
          if (parsed !== hex) setHex(parsed);
        }
      } catch {
        /* localStorage unavailable or stored value unparseable — keep seed */
      }
    }
  }, []);

  // Derive ramp + scale lazily from inputs.
  const ramp = useMemo(() => oklchRamp(hex), [hex]);
  const scale = useMemo(() => buildScale(hex), [hex]);

  const named = useMemo(() => findByHex(hex), [hex]);
  // Default brand name: the named-color slug if we have one, else "brand".
  // (Assumption documented in the implementation report.)
  const brandName = named?.slug ?? 'brand';

  // URL sync whenever the hex changes from any source, plus persist the
  // last-used color. The localStorage write is the store for the root-route
  // re-seed in the mount handler above.
  useEffect(() => {
    syncUrl(hex, userChoseRef.current);
    try {
      window.localStorage.setItem(STORAGE_KEYS.hex, hex);
    } catch {
      /* localStorage may be unavailable in private mode */
    }
  }, [hex]);

  const handleChangeHex = useCallback((next: Hex) => {
    // User-initiated (color picker + the hex text input via PreviewBlock).
    // Flip the gate so syncUrl promotes the root `/` to `/[hex]`.
    userChoseRef.current = true;
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
    // User-initiated (shade-row "use as source"). Flip the gate so syncUrl
    // promotes the root `/` to `/[hex]`.
    userChoseRef.current = true;
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

      <div className="grid w-full gap-8 px-4 py-8 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:grid-cols-[22rem_minmax(0,1fr)] lg:gap-14 lg:px-8 lg:py-12">
        {/* Left rail: preview + input + controls (sticky on desktop) */}
        <aside className="hidden md:block md:sticky md:top-8 md:self-start">
          <PreviewBlock hex={hex} named={named} onChange={handleChangeHex} />
          <div className="mt-6 flex flex-col gap-5">
            <div className="border-t border-hairline pt-5">
              <AlgorithmToggle view={view} onChange={setView} />
            </div>

            <CopyFormatPicker
              value={copyFormat}
              onChange={setCopyFormat}
              hasStop={view === 'scale'}
            />
            <ShareRow hex={hex} named={named} />
          </div>
        </aside>

        {/* Right column: ramp or scale + the algorithm toggle on mobile.
            `min-w-0` lets this grid item shrink to its track instead of being
            propped open by its content's min-content (long mono values, the
            header row), which otherwise overflows the grid on narrow screens. */}
        <section className="flex min-w-0 flex-col gap-4">
          {/* Mobile (< md): the left rail is hidden, so the color input lives
              here. Without this, the home page `/` and every /[hex] page would
              have no way to enter or change a color on a phone. */}
          <div className="flex flex-col gap-5 md:hidden">
            <PreviewBlock hex={hex} named={named} onChange={handleChangeHex} />
            <div className="flex flex-col gap-3 border-t border-hairline pt-5">
              <AlgorithmToggle view={view} onChange={setView} />
              <CopyFormatPicker
                value={copyFormat}
                onChange={setCopyFormat}
                hasStop={view === 'scale'}
              />
              <ShareRow hex={hex} named={named} />
            </div>
          </div>

          {/* Below lg the eyebrow heading is hidden: on a phone/tablet column
              "eyebrow · stops · mode · PNG" is wider than the column and forces
              horizontal overflow. Dropping the eyebrow frees ~160px so the
              metadata + PNG fit. With the eyebrow gone only one child remains,
              so right-align it (justify-end) rather than spread it
              (justify-between). The sr-only <h1> still carries the heading. */}
          <div className={`flex items-center justify-end gap-4 lg:justify-between${view === 'scale' ? ' border-b border-hairline pb-2' : ''}`}>
            {view === 'ramp' ? (
              <span className="eyebrow hidden lg:inline">Tints and Shades</span>
            ) : (
              <span className="eyebrow hidden lg:inline">Scale</span>
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
            )}
          </div>
        </section>
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

function AlgorithmToggle({
  view,
  onChange,
}: {
  view: View;
  onChange: (v: View) => void;
}) {
  // The single primary selector: a pill segmented control switching between
  // the Tailwind 11-stop scale (default, left) and the OKLCH continuous ramp
  // (right). `view` remains the underlying state — 'scale' = Tailwind,
  // 'ramp' = OKLCH — so the `?view=` URL contract and stored preference are
  // unchanged; only the labels are new.
  const OPTIONS = [
    { v: 'scale', label: 'Tailwind' },
    { v: 'ramp', label: 'OKLCH' },
  ] as const;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="eyebrow">Algorithm</span>
        <AlgorithmInfoButton />
      </div>
      <div
        role="tablist"
        aria-label="Palette algorithm"
        className="relative inline-grid w-full grid-cols-2 rounded-full bg-paper-2 p-1 ring-1 ring-ink/10"
      >
        {/* Sliding indicator — left for Tailwind (default), right for OKLCH. */}
        <span
          aria-hidden="true"
          className={[
            'absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-full bg-ink shadow-sm',
            'transition-transform duration-200 ease-out motion-reduce:transition-none',
            view === 'ramp' ? 'translate-x-full' : 'translate-x-0',
          ].join(' ')}
        />
        {OPTIONS.map(({ v, label }) => {
          const active = view === v;
          return (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(v)}
              className={[
                'relative z-10 rounded-full px-4 py-2 text-sm font-medium tracking-tight',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60',
                active ? 'text-paper' : 'text-ink/70 hover:text-ink',
              ].join(' ')}
            >
              {label}
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
            <span className="font-mono font-semibold">Tailwind</span> builds an 11-stop
            scale (50–950) snapped to your color's nearest stop — drop-in tokens for a
            Tailwind theme, with copy-ready exports. Pick this to wire a color into a
            design system.
          </p>
          <p>
            <span className="font-mono font-semibold">OKLCH</span> walks a 20-shade ramp
            in a perceptually uniform color space. Lightness steps feel evenly spaced and
            chroma stays controlled, so mid-tones don't go muddy. Pick this for a full
            tint-to-shade range.
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
