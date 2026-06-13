import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useId,
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
import type { SamplePoint } from '../lib/color/extract-image';
import { parseColor, toOklch } from '../lib/color/parse';
import { formatForCopy } from '../lib/color/format';
import { oklchRamp } from '../lib/color/ramp';
import { buildScale } from '../lib/color/scale';
import { buildColorPageData } from '../lib/color/page-data';
import { colorPageMarkdown } from '../lib/markdown/color-page';
import { registerWebMcpTools } from '../lib/mcp/webmcp';
import { suggestPaletteName } from '../lib/color/palette-name';
import { contrastRatio, wcagLevel, type WcagLevel } from '../lib/color/contrast';
// Use the slim hex-lookup so the React island doesn't drag the full
// blurb-bearing NAMED_COLORS module into its bundle. The page chrome
// only reads `named.name` and `named.slug` from the result.
import {
  findByHexSlim as findByHex,
  NAMED_COLORS_SLIM,
} from '../lib/data/named-colors-slim';
import { nearestNamedSlug } from '../lib/data/nearest-named';
import ContinuousRamp from './ContinuousRamp';
import ExportControls from './ExportControls';
import { ToastProvider, useToast } from './Toast';
import ColorPicker, { type ColorPickerHandle } from './ColorPicker';
import ShareRow from './ShareRow';
import SignInModal from './SignInModal';
import type { MeResponse } from '../lib/auth/types';

// The Tailwind scale is the default view, so its grid ships eagerly and is
// server-rendered - real content on first paint, no skeleton flash. The
// heaviest leaf (the export modal plus the five export-format serializers)
// stays lazy: the inline "Export" trigger (`ExportControls`) is eager, but the
// modal it opens is `React.lazy`-loaded on first use. The OKLCH continuous ramp
// is eager too - it just reuses the shared `ShadeRow` - so toggling views is
// instant.
import TailwindScale from './TailwindScale';
import {
  rampToTokens,
  scaleToTokens,
  dedupeGroupNames,
  sanitizeName,
  type ColorGroup,
} from '../lib/exports/tokens';

/**
 * Top-level React island for the shade tool.
 *
 * Owns:
 *   - current hex (URL-synced)
 *   - view selection (Tailwind scale vs OKLCH ramp; default Tailwind) -
 *     persisted in localStorage and mirrored to `?view=scale|ramp`
 *   - copy-format preference - persisted in localStorage
 *   - export-format preference - persisted in localStorage
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

/** One color collected into the "Add to palette" working tray. */
interface TrayColor {
  hex: Hex;
  view: View;
  copyFormat: CopyFormat;
  /**
   * Semantic role for this swatch. Two ways it's set:
   *   - Explicitly, for the auto-seeded fixed roles (Neutral, Success,
   *     Warning, Error - see `DEFAULT_PALETTE_EXTRAS`) and for any
   *     swatch the user renames.
   *   - Implicitly (absent), for the user's own brand colors: the band then
   *     falls back to `defaultSemanticName(tray, index)`, which labels the
   *     first un-named swatch "Primary", then "Secondary", "Accent", …
   */
  semanticName?: string;
  /**
   * True for the conventional design-token roles auto-seeded when the palette
   * first becomes multi-color (Neutral/Success/Warning/Error). Marks
   * where the fixed block begins so a newly-added brand color is inserted ahead
   * of it (keeping Primary + Accents grouped). Dropped on save like the rest of
   * the tray's non-color metadata.
   */
  fixed?: boolean;
  /**
   * Normalized (0..1) location on the source image, present only in image mode
   * (`/image-color-picker`). Every tray color there mirrors a draggable sample
   * point on the uploaded image; ImagePalettePanel reads this to position the
   * circle and writes it back on a drag. Absent for the default tool.
   */
  point?: { x: number; y: number };
}

/**
 * Conventional design-token roles auto-seeded the first time a palette becomes
 * multi-color (the user adds a second color). They're ordinary, editable,
 * removable swatches - the user can recolor or delete any of them - but they
 * give a fresh multi-color palette a sensible starting shape instead of two
 * bare brand colors. Hexes are canonical lowercase `#rrggbb`; the common bases
 * are Tailwind's gray-500 / green-500 / amber-500 / red-500.
 */
const DEFAULT_PALETTE_EXTRAS: { hex: Hex; semanticName: string }[] = [
  { hex: '#6b7280', semanticName: 'Neutral' },
  { hex: '#22c55e', semanticName: 'Success' },
  { hex: '#f59e0b', semanticName: 'Warning' },
  { hex: '#ef4444', semanticName: 'Error' },
];

/**
 * Positional default label for a swatch with no explicit `semanticName`. The
 * fixed Neutral/Success/Warning/Error swatches carry their own
 * explicit name, so they're skipped here: only the user's brand colors fall
 * through, and they read "Primary" (the first un-named swatch), then
 * "Secondary", then "Accent", then "Accent 2", "Accent 3", … - regardless of
 * how the fixed block is interleaved or trimmed.
 */
function defaultSemanticName(tray: TrayColor[], index: number): string {
  let rank = 0;
  for (let j = 0; j < index; j++) {
    if (!tray[j].semanticName) rank++;
  }
  if (rank === 0) return 'Primary';
  if (rank === 1) return 'Secondary';
  if (rank === 2) return 'Accent';
  return `Accent ${rank - 1}`;
}

// Lazy so the canvas/extraction code (and the `quantize` dependency it pulls in)
// never ships in the `/` and `/[hex]` bundles - it loads only on the image route
// when ShadeTool renders in `mode="image"`.
const ImagePalettePanel = lazy(() => import('./ImagePalettePanel'));

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
 *      the same value the server saw - `initial`, derived in the page from
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
  // mount uses the raw `setValue`, so it does NOT count as interaction - that
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
      // No URL hint - fall back to localStorage.
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
    // NOT dirty a clean URL - otherwise a returning visitor whose stored pref
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
      /* ignore - URL update is best-effort */
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

// Brand-name slug for a hex: the exact named slug when known, else the nearest
// by OKLab distance. `nearestNamedSlug` scans all ~209 named colors, so each
// call is non-trivial; the result for a given hex is deterministic, so we cache
// it module-wide. Now feeds only the single-color `brandName` (multi-color
// family names switched to the tray's semantic names), but the cache is kept:
// an image-mode drag re-derives `brandName` for the active hex every frame, and
// without it that would rescan all ~209 colors per move. Bounded so it can't
// grow without limit across a long session of arbitrary picks.
const brandNameCache = new Map<Hex, string>();
function brandNameForHex(hex: Hex): string {
  const cached = brandNameCache.get(hex);
  if (cached !== undefined) return cached;
  const slug = findByHex(hex)?.slug ?? nearestNamedSlug(hex);
  if (brandNameCache.size > 512) brandNameCache.clear();
  brandNameCache.set(hex, slug);
  return slug;
}

// Bare-hex URL: /4040ff, /ff7f50 - i.e. /[hex]. We keep the pathname in
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
// user actually picks a color). It does NOT gate the `isHexRoute()` branch -
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
    /* ignore - URL update is best-effort */
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
  /**
   * `'default'` is the homepage / [hex] tool. `'image'` powers
   * `/image-color-picker`: it mounts the source-image panel above the tool,
   * makes the image the only editor of palette colors (the hand-entry / picker
   * add+edit affordances are hidden), starts with an empty palette, and never
   * rewrites the URL or touches the last-used-color in localStorage.
   */
  mode?: 'default' | 'image';
}

export default function ShadeTool({
  initialHex,
  initialView,
  initialExportFormat,
  initialCopyFormat,
  mode,
}: ShadeToolProps) {
  return (
    <ToastProvider>
      <ShadeToolInner
        initialHex={initialHex}
        initialView={initialView}
        initialExportFormat={initialExportFormat}
        initialCopyFormat={initialCopyFormat}
        mode={mode}
      />
    </ToastProvider>
  );
}

function ShadeToolInner({
  initialHex,
  initialView = 'scale',
  initialExportFormat = 'tailwind-v4',
  initialCopyFormat = 'hex',
  mode = 'default',
}: ShadeToolProps) {
  const isImage = mode === 'image';
  const [hex, setHex] = useState<Hex>(() => normalizeHexInput(initialHex));
  // The color shown in the top picker / preview (swatch + hex/rgb/hsl/oklch
  // readouts). Decoupled from `hex` (the ramp source): clicking a ramp shade
  // loads it here for inspection WITHOUT regenerating the ramp. `null` means
  // "follow the source"; an effect below clears it whenever `hex` changes so
  // the preview snaps back to the source after any real source change (picker
  // edit, hex input, navigation, deep link). The source itself can only be
  // re-set from the picker / hex input, never from a shade click.
  const [inspectedHex, setInspectedHex] = useState<Hex | null>(null);
  const activeHex = inspectedHex ?? hex;
  useEffect(() => {
    setInspectedHex(null);
  }, [hex]);
  const [view, setView] = usePersistedState<View>(
    STORAGE_KEYS.view,
    ['ramp', 'scale'] as const,
    initialView,
    'view',
  );
  // The shade rows always render/copy hex now - there's no inline "Copy as"
  // picker. The persisted preference still seeds the value (so a returning
  // visitor who set oklch() keeps it), but nothing in the UI mutates it; the
  // export modal's own "Copy as" is local to the export (see `ExportControls`).
  const [copyFormat] = usePersistedState<CopyFormat>(
    STORAGE_KEYS.copyFormat,
    ['hex', 'oklch', 'rgb', 'hsl', 'cssVar', 'tailwindClass'] as const,
    initialCopyFormat,
    'copy',
  );
  const [exportFormat, setExportFormat] = usePersistedState<ExportFormat>(
    STORAGE_KEYS.exportFormat,
    ['tailwind-v4', 'tailwind-v3', 'css-vars', 'w3c-tokens', 'figma-vars', 'style-dictionary'] as const,
    initialExportFormat,
    'fmt',
  );

  const { pushToast } = useToast();

  // Tracks whether the current hex resulted from a user-initiated change
  // (picker, text input, multi-color grid "use as source", or an explicit
  // `?hex=` deep link). Note a single-color shade click only inspects (it sets
  // `inspectedHex`, never `hex`), so it doesn't flip this gate.
  // It gates the root-route URL rewrite in `syncUrl`: the post-
  // hydration localStorage seed-swap on `/` leaves this false so the URL
  // stays clean, while the first real interaction flips it true so `/` is
  // promoted to `/[hex]`. Refs are not reactive - read `.current` at fire
  // time, never in a deps array.
  const userChoseRef = useRef(false);

  // Mount handler for the URL/last-used color hand-off. Runs ONCE on mount;
  // deps intentionally empty. Precedence (highest first):
  //   1. `?hex=<raw>` - explicit deep link (replaces the old home form). On
  //      success this IS a user intent, so we flip userChoseRef and let the
  //      path rewrite to /[hex]. `?hex=` wins if both params appear.
  //   2. `?seed=<raw>` - the legacy home-form hand-off for inputs it can't
  //      resolve locally (rgb/hsl/oklch/typo). Does NOT flip userChoseRef,
  //      so its URL behavior is unchanged from before.
  //   3. localStorage['uishades:hex'] - last-used color, but ONLY on the root
  //      route and ONLY when neither param is present. No URL rewrite (the
  //      gate stays false), so SSR's clean `/` is preserved.
  //   4. (implicit) the SSR `initialHex` already in state - nothing to do.
  // Both params are always stripped after consumption so a refresh doesn't
  // re-parse and shared URLs don't leak the raw input.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (typeof window === 'undefined') return;
    // Image mode starts with an empty palette (the uploaded image seeds it) and
    // never participates in the `?hex=`/last-used hand-off, so skip all of it.
    if (isImage) return;
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

    // The palette tray starts empty - the user opts in by adding colors via
    // "Add to palette" / the "+" box. This mount handler only resolves which
    // color is *shown* (the deep-link / last-used hand-off below); it never
    // seeds the tray.

    if (rawHex) {
      // 1. Explicit `?hex=` deep link - user intent, so promote to /[hex].
      const decoded = decode(rawHex);
      // Strip both params before the hex-effect runs so the rewritten path
      // doesn't carry ?hex= along.
      stripParams();
      try {
        const parsed = parseColor(decoded);
        userChoseRef.current = true;
        if (parsed !== hex) setHex(parsed);
      } catch {
        pushToast(`Couldn't parse "${decoded}" - showing ${hex} instead.`);
      }
      return;
    }

    if (rawSeed) {
      // 2. Legacy `?seed=` hand-off. Behavior unchanged - does NOT flip the
      // user-choice gate.
      const decoded = decode(rawSeed);
      stripParams();
      try {
        const parsed = parseColor(decoded);
        if (parsed !== hex) setHex(parsed);
      } catch {
        pushToast(`Couldn't parse "${decoded}" - showing ${hex} instead.`);
      }
      return;
    }

    // 3. No param - on the root route, restore the last-used color from
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
        /* localStorage unavailable or stored value unparseable - keep default */
      }
    }
  }, []);

  // Derive ramp + scale lazily from inputs.
  const ramp = useMemo(() => oklchRamp(hex), [hex]);
  const scale = useMemo(() => buildScale(hex), [hex]);

  const named = useMemo(() => findByHex(hex), [hex]);
  // Export family-name prefix: the exact named-color slug when the input is a
  // known color, else the nearest named color by OKLab distance. This way an
  // arbitrary pick still exports as e.g. `--color-royalblue-50` rather than a
  // generic `brand`. (`named` stays exact-only so the input label never
  // mislabels an arbitrary color as a named one.)
  const brandName = useMemo(() => named?.slug ?? brandNameForHex(hex), [named, hex]);

  // URL sync whenever the hex changes from any source, plus persist the
  // last-used color. The localStorage write is the store for the root-route
  // re-seed in the mount handler above.
  //
  // Perf: a color-picker drag fires `setHex` per pointermove (~60/s). The
  // `history.replaceState` + synchronous `localStorage.setItem` here were
  // running on every one of those frames, throttling the whole gesture. We
  // coalesce them to one rAF: each hex change records the latest value and
  // schedules a single flush, cancelling any pending one. The settled value
  // is ALWAYS persisted - the last change schedules a flush that runs on the
  // next frame, and an unmount/route-change flushes synchronously so nothing
  // is lost (the `?view=` e2e + last-used-color contract both depend on the
  // final value landing in the URL/localStorage). `userChoseRef` is read at
  // flush time so the `/` → `/[hex]` promotion still fires after the gesture.
  const pendingHexRef = useRef<Hex>(hex);
  const syncRafRef = useRef<number | null>(null);
  const flushHexSync = useCallback(() => {
    if (syncRafRef.current !== null) {
      cancelAnimationFrame(syncRafRef.current);
      syncRafRef.current = null;
    }
    const h = pendingHexRef.current;
    syncUrl(h, userChoseRef.current);
    try {
      window.localStorage.setItem(STORAGE_KEYS.hex, h);
    } catch {
      /* localStorage may be unavailable in private mode */
    }
  }, []);
  useEffect(() => {
    // Image mode keeps a stable `/image-color-picker` URL (the active color is
    // an image sample point, not a destination) and must not clobber the home
    // tool's remembered last-used color - so neither sync runs there.
    if (isImage) return;
    pendingHexRef.current = hex;
    if (typeof window === 'undefined' || typeof requestAnimationFrame !== 'function') {
      // SSR / no rAF: run synchronously (also keeps non-browser test envs happy).
      flushHexSync();
      return;
    }
    // Coalesce: a pending rAF already covers this update - just let it pick up
    // the latest `pendingHexRef` value on the next frame. Otherwise schedule
    // one. We intentionally do NOT flush in the effect cleanup on a normal
    // re-run (that would make a drag synchronous again); the pending rAF always
    // flushes the latest value within one frame of the last change.
    if (syncRafRef.current === null) {
      syncRafRef.current = requestAnimationFrame(() => {
        syncRafRef.current = null;
        flushHexSync();
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hex, isImage]);
  // Unmount: flush the last pending value synchronously so a gesture that ends
  // with an immediate navigation/unmount still persists its settled hex.
  useEffect(
    () => () => {
      if (!isImage && syncRafRef.current !== null) flushHexSync();
    },
    [isImage, flushHexSync],
  );

  const handleChangeHex = useCallback((next: Hex) => {
    // User-initiated (color picker + the hex text input via PreviewBlock).
    // Flip the gate so syncUrl promotes the root `/` to `/[hex]`.
    userChoseRef.current = true;
    setHex(next);
  }, []);

  // Copy-success toasts are fired by ShadeRow / ExportModal themselves -
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
  // updates - just without reloading the page. Mirrors the color-picker
  // flow so the arrow link behaves the same as the top-left color box.
  const handleNavigate = useCallback((h: Hex) => {
    // User-initiated (multi-color grid "use as source"). Flip the gate so
    // syncUrl promotes the root `/` to `/[hex]`.
    userChoseRef.current = true;
    setHex(h);
  }, []);

  // Single-color shade click: load the shade into the top picker / preview for
  // inspection (its swatch + format readouts) without touching the ramp source.
  // Not URL-synced - this is ephemeral preview state, and the page's identity
  // stays the source hex.
  const handleInspect = useCallback((h: Hex) => {
    setInspectedHex(h);
  }, []);

  // WebMCP: expose `set_color` / `get_current_palette` to in-browser agents via
  // `navigator.modelContext` (no-op + auto-cleanup on browsers without it).
  // `hexRef` lets the registered tools read the latest hex without re-running.
  const hexRef = useRef(hex);
  hexRef.current = hex;
  useEffect(
    () =>
      registerWebMcpTools({
        getHex: () => hexRef.current,
        setColor: (h) => handleNavigate(h),
      }),
    [handleNavigate],
  );

  // --- Account -------------------------------------------------------------
  // Per-user state is fetched client-side from the credentialed `/api/me` on
  // mount - never server-rendered, since `/[hex]` HTML is edge-cached for 30
  // days and SSR'd per-user state would leak across visitors.
  const [authUser, setAuthUser] = useState<MeResponse['user']>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/me', { credentials: 'same-origin' })
      .then((r): Promise<MeResponse> =>
        r.ok ? r.json() : Promise.resolve({ user: null, presets: [], plan: 'free' }),
      )
      .then((data) => {
        if (cancelled) return;
        setAuthUser(data.user);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setAuthLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // One-shot sign-in outcome from the magic-link / OAuth callbacks (they
  // redirect to `/?signin=…`); surface it, then strip the param.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let status: string | null = null;
    try {
      const url = new URL(window.location.href);
      status = url.searchParams.get('signin');
      if (status) {
        url.searchParams.delete('signin');
        window.history.replaceState(null, '', url.toString());
      }
    } catch {
      return;
    }
    const messages: Record<string, string> = {
      expired: 'That sign-in link expired. Request a new one.',
      invalid: 'That sign-in link was invalid.',
      unverified: "Couldn't sign in - your provider email isn't verified.",
      error: 'Sign-in failed. Please try again.',
    };
    if (status && messages[status]) pushToast(messages[status], { durationMs: 3500 });
  }, [pushToast]);

  // --- Palette tray ---------------------------------------------------------
  // The ONLY behavioural addition to the core tool. "Add to palette" pushes the
  // current {hex, view, copyFormat} into a small working tray; "Save palette →"
  // names it and POSTs to /api/palettes, then routes to the owner editor. Gated
  // on signed-in (reuses the same /api/me probe + the AuthMenu sign-in modal
  // surfaced by the header's HeaderAuth island).
  //
  // The tray section is always visible but starts empty: a fresh visitor opts
  // in by adding colors via "Add to palette" / the "+" box. The tray never
  // touches the URL or localStorage, so `/` and `/[hex]` stay identical and `/`
  // is only promoted to `/[hex]` on a real color change.
  const [tray, setTray] = useState<TrayColor[]>([]);

  // Token-form family slug per tray slot — the single source for BOTH the
  // multi-color export token family names and the grid's per-column copy labels
  // (`var(--<name>-…)` / `bg-<name>-…`), so the copied tokens and the exported
  // file always agree. Derived from each swatch's EFFECTIVE semantic name — the
  // user's explicit rename, else the positional default ("Primary"/"Secondary"/
  // "Accent") or a seeded role (Neutral/Success/…), i.e. exactly what the
  // preview band header shows — then `sanitizeName`d to a CSS-safe slug
  // ("Accent 2" → "accent-2"). `sanitizeName` is idempotent, so the export path's own
  // `dedupeGroupNames`→`sanitizeName` pass is a no-op on these. (The band header
  // still renders the human form; `brandNameForHex` still derives the
  // single-color `brandName` below — only multi-color families went semantic.)
  const paletteNames = useMemo(
    () =>
      tray.map((c, i) =>
        sanitizeName(c.semanticName?.trim() || defaultSemanticName(tray, i)),
      ),
    [tray],
  );
  // Stable hex array for the ramp/scale views. Memoized so the per-color export
  // groups (and the grid) don't rebuild every palette color's ramp on each
  // render just because an inline `.map` produced a fresh array identity.
  const paletteHexes = useMemo(() => tray.map((c) => c.hex), [tray]);
  // Column index where the auto-seeded semantic block (Neutral/…) begins —
  // shared by the preview band and the shade grid so their user↔semantic gap
  // lines up. `length` when there's no seeded block (no gap then).
  const paletteBoundary = useMemo(() => {
    const firstFixed = tray.findIndex((c) => c.fixed);
    return firstFixed === -1 ? tray.length : firstFixed;
  }, [tray]);

  // "See your color as a UI" preview inputs. The tool is single-color centric,
  // so we feed the neutral-shell adapter the tray (when it holds colors) or just
  // the live `hex`; it pins white bg / faint surface and routes the brand
  // color(s) into accent + chart extras (see `mocks/tool-roles.ts`).
  // Export groups for the current view + palette, consumed by the shade-grid
  // export row inside the view component. Multi-column (2+ palette colors) →
  // one collision-safe group per swatch; else just the active scale or ramp.
  // `source` is each swatch's own OKLCH so dedupeGroupNames can disambiguate a
  // name collision descriptively (e.g. `maroon` + `dark-maroon`) rather than
  // with a bare `-2`.
  const exportGroups = useMemo<ColorGroup[]>(() => {
    const multiColumn = paletteHexes.length >= 2;
    const groupName = (i: number) => paletteNames[i] ?? brandName ?? 'brand';
    if (view === 'ramp') {
      if (multiColumn) {
        return dedupeGroupNames(
          paletteHexes.map((h, i) => ({
            name: groupName(i),
            tokens: rampToTokens(oklchRamp(h)),
            source: toOklch(h),
          })),
        );
      }
      return [{ name: brandName ?? 'brand', tokens: rampToTokens(ramp) }];
    }
    if (multiColumn) {
      return dedupeGroupNames(
        paletteHexes.map((h, i) => ({
          name: groupName(i),
          tokens: scaleToTokens(buildScale(h)),
          source: toOklch(h),
        })),
      );
    }
    return [{ name: brandName ?? 'brand', tokens: scaleToTokens(scale) }];
  }, [view, paletteHexes, paletteNames, brandName, ramp, scale]);

  const handleAddToTray = useCallback(() => {
    // Add the color the preview is currently showing (`activeHex` = the
    // inspected shade if one was clicked, else the source). Keeps the "Add to
    // palette" button consistent with the swatch/values above it. In the "+"
    // picker-append flow the picker edit resets the inspect override, so
    // `activeHex === hex` there - it appends the freshly-picked color as before.
    const addHex = activeHex;
    setTray((prev) => {
      if (prev.some((c) => c.hex === addHex)) {
        pushToast('That color is already in the palette.', { durationMs: 2500 });
        return prev;
      }
      const added: TrayColor = { hex: addHex, view, copyFormat };
      // First time the palette opens (0 → 1): seed the conventional
      // design-token roles alongside the user's first color, so the palette
      // opens as Primary + Neutral/Success/Warning/Error rather than
      // a single bare swatch. Adding one color now switches straight to the
      // multi-color palette layout. Any fixed color whose hex collides with an
      // existing swatch is skipped (the tray keeps hexes unique). Default tool
      // only - image mode owns its extracted palette and adds via
      // `handleImageAddPoint`, never here.
      if (prev.length === 0) {
        const used = new Set([...prev.map((c) => c.hex), addHex]);
        const extras: TrayColor[] = DEFAULT_PALETTE_EXTRAS.filter(
          (e) => !used.has(e.hex),
        ).map((e) => ({
          hex: e.hex,
          view,
          copyFormat,
          semanticName: e.semanticName,
          fixed: true,
        }));
        pushToast(`Added ${addHex} to the palette.`);
        return [...prev, added, ...extras];
      }
      // Later adds: drop the new brand color in just before the fixed block so
      // Primary + Accents stay grouped ahead of Neutral/…
      pushToast(`Added ${addHex} to the palette.`);
      const firstFixed = prev.findIndex((c) => c.fixed);
      if (firstFixed === -1) return [...prev, added];
      return [...prev.slice(0, firstFixed), added, ...prev.slice(firstFixed)];
    });
  }, [activeHex, view, copyFormat, pushToast]);

  // The palette "+" box opens the SAME top color picker (anchored at the top
  // swatch), driving the live page color while open. We arm this ref before
  // opening so that when that picker closes, the chosen color is also appended
  // to the tray. Separate refs per column (desktop rail / mobile panel) because
  // both PreviewBlocks are always mounted; the "+" must open the visible one.
  const desktopPickerRef = useRef<ColorPickerHandle>(null);
  const mobilePickerRef = useRef<ColorPickerHandle>(null);
  const addToTrayOnCloseRef = useRef(false);
  // Index of the tray swatch currently being edited through the picker, or null
  // when the picker isn't in edit mode. Mutually exclusive with
  // `addToTrayOnCloseRef`: a swatch click arms this, the "+" arms that.
  const editTrayIndexRef = useRef<number | null>(null);
  // The color the edited swatch held when the picker opened, so we can skip the
  // write-back + toast when the user closes without actually changing it.
  const editTrayOriginalHexRef = useRef<Hex | null>(null);

  const openPickerForPalette = useCallback((picker: ColorPickerHandle | null) => {
    addToTrayOnCloseRef.current = true;
    picker?.open();
  }, []);

  // Single-clicking a palette swatch just makes it the live page color - it does
  // not open the picker.
  const selectTrayColor = useCallback(
    (index: number) => {
      const target = tray[index];
      if (target) handleChangeHex(target.hex);
    },
    [tray, handleChangeHex],
  );

  // Double-clicking a palette swatch opens the SAME top picker pre-seeded with
  // that swatch's color (it becomes the live page color), then writes the
  // adjusted color back into that swatch on close.
  const openPickerForEdit = useCallback(
    (index: number, picker: ColorPickerHandle | null) => {
      const target = tray[index];
      if (!target) return;
      editTrayIndexRef.current = index;
      editTrayOriginalHexRef.current = target.hex;
      handleChangeHex(target.hex);
      picker?.open();
    },
    [tray, handleChangeHex],
  );

  // The full-width palette band spans both breakpoints (it lives in the right
  // column, visible on phone and desktop alike), so unlike the rail/mobile
  // PaletteTrays it can't bind to a single picker ref up front. Resolve the
  // viewport-visible picker at click time so the edit popover anchors to the
  // swatch the user can actually see (desktop rail ≥ md, mobile block below).
  // The query MUST use the same UNIT as the CSS that toggles the aside
  // (`hidden md:flex`) / mobile block (`md:hidden`): Tailwind v4's `md` is
  // `48rem`, not `768px`. They only coincide at a 16px root font-size - at a
  // larger root size (a common a11y setting) a px query would pick the picker
  // that lives in the currently-hidden container, opening the popover inside a
  // `display:none` rail (invisible) and silently killing double-click-to-edit.
  // `matchMedia` resolves `rem` against the live root font-size, so this stays
  // in lockstep with the breakpoint.
  const editBandColor = useCallback(
    (index: number) => {
      const desktopVisible =
        typeof window !== 'undefined' &&
        window.matchMedia('(min-width: 48rem)').matches;
      const picker = desktopVisible
        ? desktopPickerRef.current
        : mobilePickerRef.current;
      openPickerForEdit(index, picker);
    },
    [openPickerForEdit],
  );

  // Sibling of `editBandColor` for the band's trailing "+" button: resolve the
  // viewport-visible picker (same `rem`-based breakpoint query) and open it to
  // append a new color to the palette on close.
  const addBandColor = useCallback(() => {
    const desktopVisible =
      typeof window !== 'undefined' &&
      window.matchMedia('(min-width: 48rem)').matches;
    const picker = desktopVisible
      ? desktopPickerRef.current
      : mobilePickerRef.current;
    openPickerForPalette(picker);
  }, [openPickerForPalette]);

  const handlePickerOpenChange = useCallback(
    (open: boolean, canceled: boolean) => {
      if (open) return;
      // Editing an existing swatch: write the live color back into that slot in
      // place (preserving its view/copyFormat). An Escape dismiss (canceled)
      // leaves the swatch untouched.
      if (editTrayIndexRef.current !== null) {
        const idx = editTrayIndexRef.current;
        const originalHex = editTrayOriginalHexRef.current;
        editTrayIndexRef.current = null;
        editTrayOriginalHexRef.current = null;
        // Skip the write-back + toast if the picker closed on the same color it
        // opened with (or was dismissed via Escape) - nothing actually changed.
        if (!canceled && hex !== originalHex) {
          setTray((prev) =>
            prev.map((c, i) => (i === idx ? { ...c, hex } : c)),
          );
          pushToast(`Updated palette color to ${hex}.`);
        }
        return;
      }
      // Only a "+"-initiated open arms the add-on-close; a normal top-swatch
      // open/close leaves the flag false and adds nothing. Any close consumes
      // the flag, but an Escape dismiss (canceled) appends nothing.
      if (addToTrayOnCloseRef.current) {
        addToTrayOnCloseRef.current = false;
        if (!canceled) handleAddToTray();
      }
    },
    [handleAddToTray, hex, pushToast],
  );

  const handleRemoveFromTray = useCallback((index: number) => {
    setTray((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // Rename a swatch's semantic role (Primary, Neutral, …). A blank/whitespace
  // value clears the override so the band reverts to the positional default.
  const handleRenameSemantic = useCallback((index: number, name: string) => {
    const trimmed = name.trim();
    setTray((prev) =>
      prev.map((c, i) =>
        i === index
          ? { ...c, semanticName: trimmed.length > 0 ? trimmed : undefined }
          : c,
      ),
    );
  }, []);

  // --- Image mode (the /image-color-picker source-image panel) -------------
  // In image mode the tray IS the set of sample points: each entry carries its
  // normalized `point` so ImagePalettePanel can draw and drag its circle. The
  // panel never owns the palette - every gesture flows through these handlers so
  // the tray, the preview band, and the ramp below all stay in lockstep.

  // Replace the whole palette from a fresh extraction; the dominant color (first)
  // becomes the active color that drives the ramp/scale.
  const handleImageExtract = useCallback(
    (points: SamplePoint[]) => {
      setTray(
        points.map((p) => ({
          hex: p.hex,
          view,
          copyFormat,
          point: { x: p.x, y: p.y },
        })),
      );
      if (points.length > 0) setHex(points[0].hex);
    },
    [view, copyFormat],
  );

  const handleImageAddPoint = useCallback(
    (p: SamplePoint) => {
      setTray((prev) => [...prev, { hex: p.hex, view, copyFormat, point: { x: p.x, y: p.y } }]);
      setHex(p.hex);
    },
    [view, copyFormat, pushToast],
  );

  // Live during a drag: rewrite the dragged point's color + location and make it
  // the active color (so the ramp tracks the circle under the cursor).
  const handleImageMovePoint = useCallback((index: number, p: SamplePoint) => {
    setTray((prev) =>
      prev.map((c, i) => (i === index ? { ...c, hex: p.hex, point: { x: p.x, y: p.y } } : c)),
    );
    setHex(p.hex);
  }, []);

  const handleImageRemovePoint = useCallback((index: number) => {
    setTray((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // Keep the active color valid in image mode: after a removal (or any drift)
  // that leaves `hex` pointing at a color no longer in the palette, fall back to
  // the first remaining swatch so the ramp never shows a color that isn't shown.
  useEffect(() => {
    if (!isImage || tray.length === 0) return;
    if (!tray.some((c) => c.hex === hex)) setHex(tray[0].hex);
  }, [isImage, tray, hex]);

  const handleSavePalette = useCallback(
    async (name: string) => {
      if (!authUser) {
        pushToast('Sign in to save palettes.', { durationMs: 3000 });
        return;
      }
      if (tray.length < 1) {
        pushToast('Add a color to save a palette.', { durationMs: 3000 });
        return;
      }
      try {
        const res = await fetch('/api/palettes', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({
            name,
            colors: tray.map((c) => ({
              hex: c.hex,
              view: c.view,
              copyFormat: c.copyFormat,
            })),
          }),
        });
        if (res.status === 401) {
          pushToast('Sign in to save palettes.', { durationMs: 3000 });
          return;
        }
        if (res.status === 403) {
          pushToast("You've reached the saved-palette limit.", { durationMs: 3000 });
          return;
        }
        if (!res.ok) {
          pushToast("Couldn't save the palette.", { durationMs: 3000 });
          return;
        }
        const { palette } = (await res.json()) as { palette: { id: string } };
        window.location.href = `/me/palettes/${palette.id}`;
      } catch {
        pushToast("Couldn't save the palette.", { durationMs: 3000 });
      }
    },
    [authUser, tray, pushToast],
  );

  // Suggested name for the Save-palette dialog (shown as the input placeholder,
  // so an empty submit saves with this). A single exactly-named color keeps its
  // friendly name (e.g. "Royal Blue"); otherwise we derive an evocative
  // "{Tone} {Theme}" name from all the tray colors (e.g. "Deep Ocean").
  const defaultPaletteName = useMemo(() => {
    if (tray.length === 0) return 'Untitled palette';
    if (tray.length === 1) {
      const only = findByHex(tray[0].hex);
      if (only?.name) return only.name;
    }
    return suggestPaletteName(tray.map((c) => c.hex));
  }, [tray]);

  return (
    <div className="text-ink">
      {/* Mobile sticky header: visible only < lg. Hidden in image mode until a
          color exists, so the empty extractor doesn't pin a phantom hex. */}
      {(!isImage || tray.length > 0) && (
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
      )}

      {/* Image mode: the source-image panel + the palette band stack full-width
          above the two-column tool. The upload button sits on the image's top
          edge, directly over the band that renders beneath it. */}
      {isImage && (
        <div className="flex flex-col gap-4 px-4 py-6 lg:px-8 lg:py-8">
          <Suspense fallback={<div className="h-72 w-full animate-pulse bg-paper-2" />}>
            <ImagePalettePanel
              points={tray.map((c) => ({
                hex: c.hex,
                x: c.point?.x ?? 0.5,
                y: c.point?.y ?? 0.5,
              }))}
              activeHex={tray.length > 0 ? hex : null}
              cap={8}
              onExtract={handleImageExtract}
              onAddPoint={handleImageAddPoint}
              onMovePoint={handleImageMovePoint}
              onRemovePoint={handleImageRemovePoint}
              onSelectPoint={selectTrayColor}
              onNotify={(m) => pushToast(m)}
            />
          </Suspense>
          {tray.length >= 1 && (
            <div>
              <div className="mb-2 flex items-center gap-1.5">
                <span className="font-mono text-xs uppercase tracking-tight text-mute">
                  Palette
                </span>
              </div>
              <PalettePreviewBar
                tray={tray}
                onSelectColor={selectTrayColor}
                onRemove={handleRemoveFromTray}
                onRenameSemantic={handleRenameSemantic}
                readOnly
              />
            </div>
          )}
        </div>
      )}

      {(!isImage || tray.length > 0) && (
      <div className="grid w-full gap-8 px-4 py-8 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:grid-cols-[22rem_minmax(0,1fr)] lg:gap-14 lg:px-8 lg:py-12">
        {/* Left rail: preview + input + controls (sticky on desktop) */}
        <aside className="hidden md:flex md:flex-col md:self-stretch">
          {/* Preview + palette tray stay pinned near the top while the long
              shade list scrolls; Share is pushed to the bottom of the rail
              (mt-auto) so it lines up with the bottom of the shade grid. */}
          <div className="md:sticky md:top-8">
            <PreviewBlock
              hex={activeHex}
              onChange={handleChangeHex}
              copyFormat={copyFormat}
              onAddToPalette={handleAddToTray}
              inPalette={tray.some((c) => c.hex === activeHex)}
              paletteFull={false}
              pickerRef={desktopPickerRef}
              onPickerOpenChange={handlePickerOpenChange}
              readOnly={isImage}
            />
          </div>
          <div className="mt-auto pt-8">
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
            <PreviewBlock
              hex={activeHex}
              onChange={handleChangeHex}
              copyFormat={copyFormat}
              onAddToPalette={handleAddToTray}
              inPalette={tray.some((c) => c.hex === activeHex)}
              paletteFull={false}
              pickerRef={mobilePickerRef}
              onPickerOpenChange={handlePickerOpenChange}
              readOnly={isImage}
            />
            <div className="flex flex-col gap-3 border-t border-hairline pt-5">
              <ShareRow hex={hex} named={named} />
            </div>
          </div>

          {/* Metadata row: the algorithm toggle + stops · PNG on the left, with
              the "Export" link pushed to the far end (it opens the export
              modal; the format + "Copy as" controls live inside it now, so this
              row stays compact). The sr-only <h1> still carries the heading. The
              algorithm toggle lives here (compact, inline) for both breakpoints
              rather than in the left rail / mobile control stack. This row sits
              at the top of the palette column; its bottom hairline divides it
              from the full-width palette preview (or the shades) below. */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-hairline pb-2">
            <div className="flex items-center gap-3">
              <AlgorithmToggle view={view} onChange={setView} compact />
              <span aria-hidden="true" className="font-mono text-[11px] text-mute">·</span>
              {view === 'ramp' ? (
                <DownloadPngButton
                  shades={ramp.shades}
                  paletteHexes={paletteHexes}
                  kind="ramp"
                  sourceHex={hex}
                  variant={ramp.mode}
                  subject="ramp"
                />
              ) : (
                <DownloadPngButton
                  shades={scale.shades}
                  paletteHexes={paletteHexes}
                  kind="scale"
                  sourceHex={hex}
                  variant="scale"
                  subject="scale"
                />
              )}
            </div>
            <div className="ml-auto flex items-center gap-4">
              {/* Save is a whole-palette action like Export, so the two sit
                  together. Mounted only once the palette holds a color, keeping
                  the calm single-color view unchanged. */}
              {tray.length >= 1 && (
                <SavePaletteButton
                  signedIn={!!authUser}
                  defaultName={defaultPaletteName}
                  onSave={handleSavePalette}
                />
              )}
              <ExportControls
                groups={exportGroups}
                format={exportFormat}
                copyFormat={copyFormat}
                onFormatChange={setExportFormat}
              />
            </div>
          </div>

          {/* Full-width palette preview: appears only once the tray holds a
              color, sitting just below the metadata row and above the shades.
              Its swatches mirror the left-rail tray's verbs: click sets the live
              page color (`selectTrayColor`), double-click opens the picker to
              adjust it (`editBandColor` → `openPickerForEdit`), and a
              hover-revealed × removes it (`handleRemoveFromTray`). The WCAG
              explainer (`?`) now rides each swatch's hover-revealed contrast
              badges - the only place contrast levels surface - so the band needs
              no header row. Suppressed in image mode - the band renders
              full-width above the tool there instead. */}
          {!isImage && tray.length >= 1 && (
            <div>
              <PalettePreviewBar
                tray={tray}
                onSelectColor={selectTrayColor}
                onEditColor={editBandColor}
                onAddColor={addBandColor}
                onRemove={handleRemoveFromTray}
                onRenameSemantic={handleRenameSemantic}
              />
            </div>
          )}

          <div className="relative flex flex-col gap-2.5">
            {showHintBanner && <HintBanner onDismiss={dismissHintBanner} />}
            {view === 'ramp' ? (
              <ContinuousRamp
                ramp={ramp}
                sourceHex={hex}
                paletteHexes={paletteHexes}
                paletteNames={paletteNames}
                paletteBoundary={paletteBoundary}
                copyFormat={copyFormat}
                brandName={brandName}
                onCopy={handleCopyShade}
                onNavigate={handleNavigate}
                onInspect={handleInspect}
              />
            ) : (
              <TailwindScale
                scale={scale}
                sourceHex={hex}
                paletteHexes={paletteHexes}
                paletteNames={paletteNames}
                paletteBoundary={paletteBoundary}
                copyFormat={copyFormat}
                brandName={brandName}
                onCopy={handleCopyShade}
                onNavigate={handleNavigate}
                onInspect={handleInspect}
              />
            )}
          </div>

        </section>
      </div>
      )}
    </div>
  );
}

/**
 * "Download PNG" button shared by the ramp and scale views. The drawing
 * module is dynamically imported on click so the canvas code stays out of the
 * eager ramp chunk (see `src/lib/exports/ramp-png.ts`). `subject` names the
 * palette for the accessible label; `variant` tags the download filename.
 *
 * When the palette tray holds two or more colors the export switches to a
 * column-per-color grid (built here from `paletteHexes` + `kind`, mirroring
 * `PaletteShadeGrid`) so the PNG covers every color, not just the active one.
 */
function DownloadPngButton({
  shades,
  paletteHexes,
  kind,
  sourceHex,
  variant,
  subject,
}: {
  shades: Shade[];
  paletteHexes: Hex[];
  kind: 'ramp' | 'scale';
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
      // 2+ palette colors → one ramp/scale column per color; else the single
      // active stack. `columns` undefined keeps the single-column code path.
      const multi = paletteHexes.length >= 2;
      const columns = multi
        ? paletteHexes.map((h) => (kind === 'ramp' ? oklchRamp(h).shades : buildScale(h).shades))
        : undefined;
      const { downloadRampPng } = await import('../lib/exports/ramp-png');
      await downloadRampPng({
        shades,
        columns,
        sourceHex,
        variant: multi ? `palette-${variant}` : variant,
      });
    } catch {
      pushToast("Couldn't generate the PNG in this browser.");
    } finally {
      setBusy(false);
    }
  }, [busy, shades, paletteHexes, kind, sourceHex, variant, pushToast]);

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
  onChange,
  copyFormat,
  onAddToPalette,
  inPalette,
  paletteFull,
  pickerRef,
  onPickerOpenChange,
  readOnly = false,
}: {
  hex: Hex;
  onChange: (next: Hex) => void;
  copyFormat: CopyFormat;
  onAddToPalette: () => void;
  inPalette: boolean;
  paletteFull: boolean;
  /** Lets the palette "+" box open this picker imperatively. */
  pickerRef?: React.Ref<ColorPickerHandle>;
  /** Fired when this picker opens/closes (used to append a "+"-added color);
      `canceled` is true on an Escape dismiss so it appends nothing. */
  onPickerOpenChange?: (open: boolean, canceled: boolean) => void;
  /**
   * Image-authoritative mode (`/image-color-picker`): the active color is set
   * by the image, never hand-entered. Replaces the picker-swatch + hex input
   * with a static read-out and drops the "Add to palette" button; the copyable
   * value rows and named-color label stay.
   */
  readOnly?: boolean;
}) {
  const oklchString = useMemo(() => formatForCopy(hex, 'oklch'), [hex]);
  const rgbString = useMemo(() => formatForCopy(hex, 'rgb'), [hex]);
  const hslString = useMemo(() => formatForCopy(hex, 'hsl'), [hex]);
  // Header label: exact named color, else the nearest one marked approximate.
  const displayName = useMemo(() => colorDisplayName(hex), [hex]);

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
  // AFTER the browser has painted the opacity:0 state - otherwise React
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
      /* unparseable - fall through and sync */
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
        /* partial / invalid - wait for more keystrokes */
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
  // focus-time selection - so we flag the focusing click and `preventDefault`
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

  // Color name shown at the top of the preview. A non-exact pick is announced
  // to screen readers via the "Closest named color" lead (no visible prefix).
  const nameHeader = (
    <div className="-mb-2 flex items-baseline gap-1.5">
      {displayName.exact ? (
        <span className="font-display text-[13px] text-ink-2">{displayName.name}</span>
      ) : (
        <span className="font-display text-[13px] text-ink-2">
          <span className="sr-only">Closest named color: </span>
          {displayName.name}
        </span>
      )}
    </div>
  );

  if (readOnly) {
    return (
      <div className="flex flex-col gap-4">
        {nameHeader}
        <div className="flex h-[60px] w-full items-stretch bg-paper-2">
          <span
            aria-hidden="true"
            className="block h-full w-1/4 shrink-0 ring-1 ring-inset ring-ink/10"
            style={{ backgroundColor: hex }}
          />
          <span className="flex min-w-0 flex-1 items-center px-4 font-mono text-xl tracking-tight text-ink">
            {hex}
          </span>
        </div>
        <div className="flex flex-col">
          <CopyableValueRow label="HEX" value={hex} />
          <CopyableValueRow label="OKLCH" value={oklchString} />
          <CopyableValueRow label="RGB" value={rgbString} />
          <CopyableValueRow label="HSL" value={hslString} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {nameHeader}
      <div className="flex h-[60px] w-full bg-paper-2">
        <ColorPicker
          ref={pickerRef}
          hex={hex}
          onChange={onChange}
          copyFormat={copyFormat}
          onOpenChange={onPickerOpenChange}
          triggerLabel={`Color ${hex} - open color picker`}
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
          placeholder="hex, rgb, hsl, oklch"
          className="h-full min-w-0 flex-1 bg-transparent px-4 font-mono text-xl tracking-tight text-ink placeholder:text-mute focus:outline-none"
        />
      </div>
      <button
        type="button"
        onClick={onAddToPalette}
        disabled={inPalette || paletteFull}
        className="-mt-2 inline-flex items-center justify-center gap-1.5 bg-ink px-3 py-2 font-mono text-xs uppercase tracking-tight text-paper transition-opacity duration-150 ease-out hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 disabled:cursor-default disabled:opacity-40 motion-reduce:transition-none"
      >
        {inPalette ? 'Added in Palette' : 'Add to palette'}
      </button>
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
      pushToast("Couldn't copy - clipboard is unavailable in this browser.");
      return;
    }
    navigator.clipboard.writeText(value).then(
      () => {
        setCopied(true);
        if (copiedTimeoutRef.current) clearTimeout(copiedTimeoutRef.current);
        copiedTimeoutRef.current = setTimeout(() => setCopied(false), 1500);
      },
      () => {
        pushToast("Couldn't copy - check browser permissions.");
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
        <span className="rounded-sm bg-ink px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-paper">
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
      aria-label="Dismiss tip: click a shade to copy it and preview its color values"
      onClick={onDismiss}
      className="group flex w-auto self-end items-center gap-3 bg-ink px-3.5 py-2 text-left text-sm text-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 min-[1400px]:absolute min-[1400px]:right-0 min-[1400px]:top-0 min-[1400px]:z-10 min-[1400px]:self-auto"
    >
      <span className="inline-flex items-center">
        <StarIcon
          aria-hidden="true"
          className="mr-2 h-5 w-5 shrink-0 text-yellow-400"
        />
        Click a shade to copy it and preview its color values.
      </span>
      <span
        aria-hidden="true"
        className="-mr-1 inline-flex h-6 w-6 shrink-0 items-center justify-center text-paper/70 transition-transform duration-150 ease-out group-hover:scale-150 group-hover:text-paper group-focus-visible:scale-150 group-focus-visible:text-paper motion-reduce:transition-none"
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

function StarIcon({ className, ...props }: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" className={className ?? 'h-4 w-4'} {...props}>
      <path
        d="M8 1.5l1.86 3.77 4.16.6-3.01 2.93.71 4.14L8 11.49l-3.72 1.95.71-4.14L1.98 5.87l4.16-.6L8 1.5Z"
        fill="currentColor"
      />
    </svg>
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
  compact = false,
}: {
  view: View;
  onChange: (v: View) => void;
  /**
   * Inline variant for the shades-column header row: drops the stacked
   * "Algorithm" eyebrow and tightens the pill so it can sit to the left of the
   * "N stops · PNG" metadata. The default (stacked) variant is used in the
   * left rail / mobile control stack.
   */
  compact?: boolean;
}) {
  // The single primary selector: a pill segmented control switching between
  // the Tailwind 11-stop scale (default, left) and the OKLCH continuous ramp
  // (right). `view` remains the underlying state - 'scale' = Tailwind,
  // 'ramp' = OKLCH - so the `?view=` URL contract and stored preference are
  // unchanged; only the labels are new.
  const OPTIONS = [
    { v: 'scale', label: 'Tailwind' },
    { v: 'ramp', label: 'OKLCH' },
  ] as const;
  const pill = (
    <div
      role="tablist"
      aria-label="Palette algorithm"
      className={[
        'relative inline-grid grid-cols-2 rounded-full bg-paper-2 ring-1 ring-ink/10',
        compact ? 'p-0.5' : 'w-full p-1',
      ].join(' ')}
    >
      {/* Sliding indicator - left for Tailwind (default), right for OKLCH. */}
      <span
        aria-hidden="true"
        className={[
          'absolute rounded-full bg-ink shadow-sm',
          compact
            ? 'inset-y-0.5 left-0.5 w-[calc(50%-0.125rem)]'
            : 'inset-y-1 left-1 w-[calc(50%-0.25rem)]',
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
              'relative z-10 rounded-full font-mono font-medium uppercase tracking-tight',
              compact ? 'px-2.5 py-1 text-[11px]' : 'px-4 py-2 text-sm',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60',
              active ? 'text-paper' : 'text-ink/70 hover:text-ink',
            ].join(' ')}
          >
            {label}
          </button>
        );
      })}
    </div>
  );

  if (compact) {
    return (
      <div className="flex items-center gap-1.5">
        {pill}
        <AlgorithmInfoButton />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="eyebrow">Algorithm</span>
        <AlgorithmInfoButton />
      </div>
      {pill}
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
            scale (50–950) snapped to your color's nearest stop - drop-in tokens for a
            Tailwind theme, with copy-ready exports. Pick this to wire a color into a
            design system.
          </p>
          <p>
            <span className="font-mono font-semibold">OKLCH</span> walks the same 50–950
            scale in a perceptually uniform color space. Lightness steps feel evenly spaced
            and chroma stays controlled, so mid-tones don't go muddy. Same stops as Tailwind,
            a different algorithm - pick this for a smoother tint-to-shade range.
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * `?` info button + popover explaining WCAG contrast and how to read the
 * AAA / AA / AA-Lg / Fail badges shown on the palette preview swatches.
 * Same click-to-toggle / outside-click / Escape pattern as
 * `AlgorithmInfoButton`; rendered next to each swatch's hover-revealed
 * contrast badges (the only place contrast levels surface in the UI).
 *
 * `inline`: sits inside a swatch's hover overlay, so it fades + disables
 * pointer events with the badges at rest and only reveals on the swatch's
 * hover/focus - except while its own popover is open, where it stays visible
 * so the popover (which extends below the band) can be read and dismissed.
 * `useId` keeps the popover/aria-controls ids unique across the up-to-8 swatch
 * instances.
 */
function WcagInfoButton({ inline = false }: { inline?: boolean }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const id = useId();

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

  const inlineReveal = inline
    ? ' transition-opacity duration-150 ease-out motion-reduce:transition-none' +
      (open
        ? ' opacity-100 pointer-events-auto'
        : ' opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto' +
          ' group-focus-within:opacity-100 group-focus-within:pointer-events-auto')
    : '';

  return (
    <div ref={wrapRef} className={'relative inline-flex' + inlineReveal}>
      <button
        type="button"
        aria-label="About WCAG contrast levels"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(o => !o)}
        className={
          'inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] ' +
          'font-semibold leading-none ring-1 ' +
          // Inline: inherit the swatch's readable text color (black/white) so the
          // `?` stays legible on any swatch. Default: muted on the paper bg.
          (inline
            ? 'text-current ring-current/40 hover:ring-current/70 '
            : 'text-mute ring-ink/20 hover:text-ink hover:ring-ink/40 ') +
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60'
        }
      >
        ?
      </button>
      {open && (
        <div
          id={id}
          role="dialog"
          aria-label="WCAG contrast info"
          className={
            'absolute left-0 top-full z-40 mt-2 w-72 max-w-[calc(100vw-2rem)] ' +
            'border border-hairline bg-paper p-3 text-xs leading-relaxed text-ink ' +
            'shadow-[0_10px_30px_rgba(17,17,16,0.12)]'
          }
        >
          <p className="mb-2">
            <span className="font-semibold">WCAG contrast</span> is the ratio
            between text and its background (1:1 to 21:1) - the higher the ratio,
            the more legible the text. Each badge shows the level black or white
            text reaches against that swatch.
          </p>
          <dl className="space-y-1">
            <div className="flex gap-2">
              <dt className="w-12 shrink-0 font-mono font-bold uppercase">AAA</dt>
              <dd>≥ 7:1 - enhanced contrast.</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-12 shrink-0 font-mono font-bold uppercase">AA</dt>
              <dd>≥ 4.5:1 - the standard minimum for body text.</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-12 shrink-0 font-mono font-bold uppercase">AA-Lg</dt>
              <dd>≥ 3:1 - passes only for large (≥ 24px) or bold text.</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-12 shrink-0 font-mono font-bold uppercase">Fail</dt>
              <dd>&lt; 3:1 - below the accessible threshold.</dd>
            </div>
          </dl>
        </div>
      )}
    </div>
  );
}

/** Slug → display name, for naming the nearest match to an arbitrary hex. */
const SLUG_TO_NAME = new Map(NAMED_COLORS_SLIM.map((c) => [c.slug, c.name]));

/**
 * Friendly name for a swatch: the exact named color when the hex matches one,
 * otherwise the name of the nearest named color by OKLab distance (so every
 * swatch gets a label, not just the ~209 exact hits).
 */
function nameForHex(hex: Hex): string {
  const exact = findByHex(hex);
  if (exact) return exact.name;
  return SLUG_TO_NAME.get(nearestNamedSlug(hex)) ?? hex;
}

/**
 * Like `nameForHex`, but also reports whether the match was exact - the preview
 * header marks a non-exact match approximate ("≈ Tan") so an arbitrary pick
 * still shows a recognizable label without claiming to BE that named color.
 */
function colorDisplayName(hex: Hex): { name: string; exact: boolean } {
  const exact = findByHex(hex);
  if (exact) return { name: exact.name, exact: true };
  const slug = nearestNamedSlug(hex);
  return { name: SLUG_TO_NAME.get(slug) ?? slug, exact: false };
}

/**
 * Black or white, whichever reads better on `bg`. Picks the higher WCAG
 * contrast ratio so the hover labels stay legible on any swatch color.
 */
function readableTextOn(bg: Hex): '#000000' | '#ffffff' {
  return contrastRatio(bg, '#ffffff') >= contrastRatio(bg, '#000000')
    ? '#ffffff'
    : '#000000';
}

/** Short label for a WCAG level, e.g. for a hover badge. `fail` reads "Fail". */
function wcagBadgeLabel(level: WcagLevel): string {
  return level === 'fail' ? 'Fail' : level;
}

/** Spoken form of a WCAG level for screen-reader aria-labels. */
function wcagSpoken(level: WcagLevel): string {
  switch (level) {
    case 'AAA':
      return 'passes AAA';
    case 'AA':
      return 'passes AA';
    case 'AA-Lg':
      return 'passes AA for large text only';
    case 'fail':
      return 'fails';
  }
}

/**
 * Two small WCAG-level badges revealed on a `PalettePreviewBar` swatch hover:
 * the level black text and the level white text each reach against the swatch
 * color. Each badge is rendered in the very color it describes (the black-text
 * level in black, the white-text level in white) so its legibility on the
 * swatch is itself the demonstration of that contrast. Revealed on hover/focus.
 * Decorative here - `aria-hidden` - because the swatch button's aria-label
 * already spells both levels out for screen readers.
 */
function ContrastLevels({ bg }: { bg: Hex }) {
  const swatches = [
    { fg: '#000000' as const },
    { fg: '#ffffff' as const },
  ];
  return (
    <span
      aria-hidden="true"
      className="flex items-center gap-4 opacity-0 transition-opacity duration-150 ease-out group-hover:opacity-100 group-focus-within:opacity-100 motion-reduce:transition-none"
    >
      {swatches.map(({ fg }) => {
        const level = wcagLevel(contrastRatio(bg, fg));
        return (
          <span
            key={fg}
            style={{ color: fg }}
            className="inline-flex items-baseline font-mono text-sm font-bold uppercase tracking-tight"
          >
            {wcagBadgeLabel(level)}
          </span>
        );
      })}
    </span>
  );
}

/**
 * Full-width palette preview band shown above the ramp once the tray holds any
 * color (`tray.length >= 1` - the first "Add to palette" seeds the design-token
 * roles, so a single add opens the full multi-color palette). Reuses the
 * proportional swatch-band shape
 * from `PaletteCard` (equal-width `flex-1` fills, inline `backgroundColor` so the
 * colors survive the theme toggle), but each swatch is a real control that
 * mirrors the smaller PaletteTray swatches: single-click makes it the live page
 * color (`onSelectColor`); double-click opens the color picker seeded with that
 * swatch and writes the adjustment back (`onEditColor`); and a small X revealed
 * on hover/focus removes it (`onRemove`). Each color's name is shown as a label
 * ABOVE its swatch (not inside it, always visible); the swatch itself reveals
 * its WCAG contrast levels + hex at the bottom on hover/focus, left-aligned, in
 * black or white for contrast against the swatch.
 *
 * `onEditColor`/`onRemove` are optional so the band degrades gracefully: image
 * mode passes `readOnly` (colors are edited by dragging on the image, so no
 * double-click edit) but still allows removal.
 */
function PalettePreviewBar({
  tray,
  onSelectColor,
  onEditColor,
  onAddColor,
  onRemove,
  onRenameSemantic,
  readOnly = false,
}: {
  tray: TrayColor[];
  onSelectColor: (index: number) => void;
  /** Double-click: open the picker seeded with the swatch; omitted ⇒ no edit. */
  onEditColor?: (index: number) => void;
  /**
   * Renders a trailing "+" button straddling the band's right edge that opens
   * the picker to append a color. Omitted ⇒ no add button.
   */
  onAddColor?: () => void;
  /** Reveal an X on hover/focus that removes the swatch; omitted ⇒ no remove. */
  onRemove?: (index: number) => void;
  /** Pencil-click commits a renamed semantic role; omitted ⇒ no rename pencil. */
  onRenameSemantic?: (index: number, name: string) => void;
  /** Image-authoritative mode: suppress double-click edit (remove still works). */
  readOnly?: boolean;
}) {
  const canEdit = !readOnly && !!onEditColor;
  // Which column's semantic name is being edited inline, plus its draft text.
  // Local to the band: a commit flows up through `onRenameSemantic`, but the
  // open/typing state never needs to live in the parent.
  const [editingSemantic, setEditingSemantic] = useState<number | null>(null);
  const [semanticDraft, setSemanticDraft] = useState('');
  // Set true whenever we tear the editor down ourselves (Enter commit / Escape
  // cancel) so the resulting `onBlur` doesn't fire a second, stale commit -
  // critical for Escape, which must NOT persist the draft.
  const closingSemanticRef = useRef(false);

  const startSemanticEdit = (index: number, current: string) => {
    setEditingSemantic(index);
    setSemanticDraft(current);
  };
  const commitSemanticEdit = () => {
    if (editingSemantic !== null) onRenameSemantic?.(editingSemantic, semanticDraft);
    closingSemanticRef.current = true;
    setEditingSemantic(null);
  };
  const cancelSemanticEdit = () => {
    closingSemanticRef.current = true;
    setEditingSemantic(null);
  };
  const handleSemanticBlur = () => {
    // A programmatic close (Enter/Escape) already settled the value; only a real
    // focus-loss click-away should commit here.
    if (closingSemanticRef.current) {
      closingSemanticRef.current = false;
      return;
    }
    commitSemanticEdit();
  };

  // The user's brand colors are a contiguous prefix; the auto-seeded semantic
  // block (Neutral/Success/Warning/Error) is the `fixed` suffix. `boundary` is
  // where that suffix begins — exactly where `handleAddToTray` inserts a new
  // color — so the "+" lives there (straddling the last user color's right edge,
  // i.e. next to the freshly-added color, or just Primary when it's the only
  // one) rather than trailing the whole band. A visible gap separates the two
  // groups, but only when both are actually present.
  const firstFixed = tray.findIndex((c) => c.fixed);
  const boundary = firstFixed === -1 ? tray.length : firstFixed;
  const hasGap = boundary > 0 && boundary < tray.length;
  // Index of the user swatch the "+" straddles; -1 ⇒ no user colors, so it sits
  // at the left edge of the first (fixed) swatch instead.
  const addAfterIndex = boundary > 0 ? boundary - 1 : -1;
  // Margin that opens the gap between the user group and the seeded block; the
  // header column and the band swatch at the boundary both get it so the two
  // rows stay aligned.
  const gapClass = (i: number) => (hasGap && i === boundary ? ' ml-12' : '');

  const renderAddButton = (side: 'right' | 'left') =>
    onAddColor ? (
      <button
        type="button"
        onClick={onAddColor}
        aria-label="Add a color to the palette"
        title="Add a color to the palette"
        className={
          'absolute top-1/2 z-10 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-ink text-paper shadow-md ring-2 ring-paper transition duration-150 ease-out hover:scale-110 hover:bg-ink/90 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 active:scale-95 motion-reduce:transition-none motion-reduce:hover:scale-100 ' +
          (side === 'right' ? 'right-0 translate-x-1/2' : 'left-0 -translate-x-1/2')
        }
      >
        <svg viewBox="0 0 16 16" aria-hidden="true" className="h-4 w-4">
          <path d="M8 3v10M3 8h10" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
        </svg>
      </button>
    ) : null;

  return (
    <div className="w-full">
      {/* Per-column header sitting ABOVE the colored band (not inside the
          swatch): the editable semantic role (with a pencil to rename it).
          The detected color name lives inside the swatch instead, revealed on
          hover alongside the hex. Columns are `flex-1` to line up with the
          band's equal-width swatches below. */}
      <div className="flex w-full">
        {tray.map((c, i) => {
          const actualName = nameForHex(c.hex);
          const semantic = c.semanticName ?? defaultSemanticName(tray, i);
          const editing = editingSemantic === i;
          return (
            <div
              key={`name-${c.hex}-${i}`}
              className={'flex min-w-0 flex-1 items-center gap-2 pb-1 pr-3' + gapClass(i)}
            >
              {/* LEFT: semantic role + rename pencil (or the inline editor). */}
              {editing ? (
                <input
                  type="text"
                  autoFocus
                  value={semanticDraft}
                  onChange={(e) => setSemanticDraft(e.target.value)}
                  onFocus={(e) => e.currentTarget.select()}
                  onBlur={handleSemanticBlur}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      commitSemanticEdit();
                    } else if (e.key === 'Escape') {
                      e.preventDefault();
                      cancelSemanticEdit();
                    }
                  }}
                  aria-label={`Semantic name for ${actualName}`}
                  className="min-w-0 flex-1 rounded-sm border border-hairline bg-paper px-1 py-0.5 font-display text-[13px] text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                />
              ) : (
                <span className="flex min-w-0 items-center gap-1">
                  <span
                    className="truncate font-display text-[13px] font-medium text-ink"
                    title={semantic}
                  >
                    {semantic}
                  </span>
                  {onRenameSemantic && (
                    <button
                      type="button"
                      onClick={() => startSemanticEdit(i, semantic)}
                      aria-label={`Rename the ${semantic} role`}
                      title="Rename semantic role"
                      className="inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-sm text-mute transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                    >
                      <svg viewBox="0 0 16 16" aria-hidden="true" className="h-3 w-3">
                        <path
                          d="M11 2.5l2.5 2.5L6 12.5l-3 .5.5-3L11 2.5z"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                  )}
                </span>
              )}
            </div>
          );
        })}
      </div>
      <div className="relative">
      <ul
        aria-label="Palette preview"
        className="flex h-[150px] w-full gap-[2px] border border-hairline"
      >
      {tray.map((c, i) => {
        const textColor = readableTextOn(c.hex);
        const blackLevel = wcagLevel(contrastRatio(c.hex, '#000000'));
        const whiteLevel = wcagLevel(contrastRatio(c.hex, '#ffffff'));
        return (
          <li key={`${c.hex}-${i}`} className={'group relative min-w-0 flex-1' + gapClass(i)}>
            <button
              type="button"
              onClick={() => onSelectColor(i)}
              onDoubleClick={canEdit ? () => onEditColor!(i) : undefined}
              aria-label={`Use ${c.hex} (${nameForHex(c.hex)}) as the current color${canEdit ? ' (double-click to adjust)' : ''}. Black text ${wcagSpoken(blackLevel)}, white text ${wcagSpoken(whiteLevel)}.`}
              className="h-full w-full cursor-pointer text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/60"
              style={{ backgroundColor: c.hex, color: textColor }}
            />
            {/* Hover overlay sitting over the swatch: the contrast badges + the
                WCAG explainer (`?`), then the detected name/hex. It lives OUTSIDE
                the swatch <button> so the interactive `?` isn't an invalid nested
                button; `pointer-events-none` lets swatch clicks fall through to
                the button, and only the `?` re-enables pointer events on hover.
                The swatch button's aria-label already spells the contrast levels
                out, so the badges + name/hex stay aria-hidden. */}
            <div
              className="pointer-events-none absolute inset-0 flex flex-col justify-end p-3"
              style={{ color: textColor }}
            >
              <span className="flex flex-col gap-1.5">
                <span className="flex items-center gap-2">
                  <ContrastLevels bg={c.hex} />
                  <WcagInfoButton inline />
                </span>
                {/* Detected color name + hex, hidden at rest and revealed with
                    the badges on hover/focus (mirrors the single-color
                    ShadeRow's hover label). */}
                <span
                  aria-hidden="true"
                  className="flex flex-col gap-0.5 opacity-0 transition-opacity duration-150 ease-out group-hover:opacity-100 group-focus-within:opacity-100 motion-reduce:transition-none"
                >
                  <span className="truncate font-display text-xs font-medium">
                    {nameForHex(c.hex)}
                  </span>
                  <span className="truncate font-mono text-xs uppercase">
                    {c.hex}
                  </span>
                </span>
              </span>
            </div>
            {onRemove && (
              <button
                type="button"
                aria-label={`Remove ${c.hex} from palette`}
                onClick={() => onRemove(i)}
                // `pointer-events-none` at rest so the invisible × never
                // intercepts a select-click in the corner (the whole swatch sets
                // the live color); it becomes clickable only once revealed on
                // hover/focus, matching the "× on hover" intent.
                className="pointer-events-none absolute right-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-ink/80 text-paper opacity-0 backdrop-blur-sm transition-opacity duration-150 ease-out hover:bg-ink group-hover:pointer-events-auto group-hover:opacity-100 focus-visible:pointer-events-auto focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 motion-reduce:transition-none"
              >
                <svg viewBox="0 0 16 16" aria-hidden="true" className="h-3 w-3">
                  <path d="M3 3l10 10M13 3L3 13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            )}
            {/* The "+" straddles the right edge of the last user color (where a
                new color gets inserted), sitting in the gap before the seeded
                block. With no user colors at all it rides the first swatch's
                left edge instead. */}
            {addAfterIndex === i && renderAddButton('right')}
            {addAfterIndex === -1 && i === 0 && renderAddButton('left')}
          </li>
        );
      })}
      </ul>
      </div>
    </div>
  );
}

/** Class for the "Save" trigger - mirrors ExportControls' EXPORT_TRIGGER_CLASS
 *  so Save and Export read as one matched pair in the metadata toolbar. */
const SAVE_TRIGGER_CLASS =
  'font-mono text-[11px] uppercase tracking-[0.16em] text-ink ' +
  'underline decoration-ink/30 underline-offset-4 ' +
  'transition-colors duration-150 ease-out hover:text-accent hover:decoration-accent ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60';

/**
 * Inline "Save" control for the top-right metadata toolbar, paired with Export.
 *
 * A whole-palette action: clicking "Save" reveals a small inline popover with a
 * name field (pre-filled with the suggested palette name as placeholder) and,
 * on submit, hands the name to `onSave` (which POSTs to `/api/palettes` and
 * routes to the owner editor). Signed-out submit opens the same `SignInModal`
 * the header uses rather than dead-ending. Only mounted once the palette holds a
 * color, so the calm single-color view is unchanged. Mirrors `PaletteTray`'s
 * naming logic; that component is the left-rail variant.
 */
function SavePaletteButton({
  signedIn,
  defaultName,
  onSave,
}: {
  signedIn: boolean;
  defaultName: string;
  onSave: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [signInOpen, setSignInOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);
  // True once the user has typed a custom name; after that we keep their value
  // across re-opens and stop auto-selecting it.
  const editedRef = useRef(false);

  // On open, focus the field. The first time (name still the untouched
  // suggestion) we pre-fill the suggested name and select it so the user can
  // Save immediately or type to replace. Once they've given it a custom name,
  // we keep that value and place the cursor at the end without selecting.
  useEffect(() => {
    if (open) {
      if (!editedRef.current) setName(defaultName);
      // Defer to the next frame so it runs after React commits the value to the
      // DOM, otherwise select() grabs the stale text.
      const id = requestAnimationFrame(() => {
        const el = inputRef.current;
        if (!el) return;
        el.focus();
        if (editedRef.current) {
          el.setSelectionRange(el.value.length, el.value.length);
        } else {
          el.select();
        }
      });
      return () => cancelAnimationFrame(id);
    }
  }, [open, defaultName]);

  // Dismiss the popover on an outside click (the button itself toggles).
  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        !popRef.current?.contains(target) &&
        !buttonRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [open]);

  const submit = useCallback(() => {
    // Saving requires an account: a signed-out submit opens the sign-in modal
    // (a signup nudge) instead of dead-ending.
    if (!signedIn) {
      setOpen(false);
      setSignInOpen(true);
      return;
    }
    const trimmed = name.trim().slice(0, 60);
    // An empty field saves with the suggested placeholder name.
    onSave(trimmed.length > 0 ? trimmed : defaultName);
  }, [signedIn, name, onSave, defaultName]);

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={SAVE_TRIGGER_CLASS}
      >
        Save
      </button>

      {open && (
        <div
          ref={popRef}
          role="dialog"
          aria-label="Name and save palette"
          className="absolute right-0 top-full z-20 mt-2 flex w-60 flex-col gap-2 border border-ink/15 bg-paper p-3 shadow-lg"
        >
          <input
            ref={inputRef}
            type="text"
            value={name}
            maxLength={60}
            aria-label="Palette name"
            placeholder={defaultName}
            onChange={(e) => {
              editedRef.current = true;
              setName(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                submit();
              } else if (e.key === 'Escape') {
                setOpen(false);
              }
            }}
            className="border border-ink/20 bg-paper px-3 py-2 font-mono text-sm text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={submit}
              className="inline-flex flex-1 items-center justify-center bg-ink px-3 py-2 font-mono text-xs uppercase tracking-tight text-paper transition-opacity duration-150 ease-out hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 motion-reduce:transition-none"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="inline-flex items-center justify-center border border-ink/20 px-3 py-2 font-mono text-xs uppercase tracking-tight text-ink transition-colors duration-150 ease-out hover:bg-paper-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 motion-reduce:transition-none"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {signInOpen && (
        <SignInModal
          onClose={() => setSignInOpen(false)}
          triggerRef={buttonRef}
          ariaLabel="Sign in to save palettes"
        />
      )}
    </div>
  );
}
