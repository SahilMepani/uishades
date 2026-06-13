import { memo, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import type { Shade, Hex } from '../lib/color/types';
import { contrastRatio } from '../lib/color/contrast';
import { useToast } from './Toast';
import SourceInfoButton from './SourceInfoButton';

/**
 * A single row in either the continuous ramp or the Tailwind scale.
 *
 * Behavior contract (per the spec):
 *   - Click on the row body = copy the hex (always - matches the hover label;
 *     the "Copy as" format preference governs Export and the multi-color grid,
 *     not single-color row clicks) AND load that shade into the top color
 *     picker / preview so its swatch + hex/rgb/hsl/oklch readouts reflect the
 *     clicked color (`onInspect`). A shade click does NOT change the ramp's
 *     source - the source is pinned and can only be re-set from the picker /
 *     hex input. (The old double-click / Shift+Enter "use as source" gesture
 *     was removed; the ramp now stays fixed while you click through shades.)
 *   - Cmd/Ctrl-click or middle-click on the row body = open the shade's own
 *     page in a new tab (a separate page, not an in-place source swap). The
 *     row is a div, so handleClick / handleAuxClick replicate the browser's
 *     native modifier/middle-click-a-link behavior against `navHref`.
 *
 * Keyboard:
 *   - Enter on focused row = copy + inspect (same as a plain click)
 *   - ArrowDown/ArrowUp move focus between sibling rows (handled via DOM
 *     traversal of [data-shade-row] elements so this component stays
 *     orchestrator-agnostic).
 */

export interface ShadeRowProps {
  shade: Shade;
  /**
   * The user-selected source color. Each non-source row renders this in a
   * 20%-wide band on its left edge so users can compare the row's
   * tint/shade against the source side-by-side. The source row itself
   * (shade.isInput) skips the band - splitting source-against-source would
   * just look like a solid row.
   */
  sourceHex: Hex;
  /**
   * Label printed once in the page's right gutter for this row - the Tailwind
   * stop (50…950) or the OKLCH ramp's matching 50…950 stop label. Rendered in
   * an absolutely-positioned cell floated to `left-full` (OUTSIDE the row's
   * content box), matching the multi-color `PaletteShadeGrid` gutter so the
   * single- and multi-color views read identically. Omitted = no gutter label.
   */
  gutterLabel?: string | number;
  onCopy: (hex: Hex) => void;
  /**
   * Load this shade into the top color picker / preview (swatch + format
   * readouts) without changing the ramp's source. Fired on a plain click and
   * on Enter, alongside the copy.
   */
  onInspect: (hex: Hex) => void;
}

const WHITE = '#ffffff';
const BLACK = '#000000';

function pickForeground(hex: Hex): 'white' | 'black' {
  const cw = contrastRatio(hex, WHITE);
  const cb = contrastRatio(hex, BLACK);
  return cw >= cb ? 'white' : 'black';
}

function ShadeRow({
  shade,
  sourceHex,
  gutterLabel,
  onCopy,
  onInspect,
}: ShadeRowProps) {
  const showSourceBand = !shade.isInput;
  const fg = useMemo(() => pickForeground(shade.hex), [shade.hex]);
  const fgClass = fg === 'white' ? 'text-white' : 'text-black';

  const navHref = `/${shade.hex.slice(1)}`;

  // What the row shows on hover. Always the hex value for the single-color
  // tool, regardless of the user's "Copy as" preference - the swatch's
  // identity reads most clearly as a hex, and the click still copies in the
  // chosen format (the "Click to copy" badge signals that action).
  const displayValue = shade.hex;

  const { pushToast } = useToast();

  // Feature-detect clipboard availability after hydration. SSR can't tell -
  // `navigator` is undefined and the secure-context rule is browser-specific
  // anyway. Default to `true` so SSR + first paint match, then flip to
  // `false` once we know better. When unavailable we hide the copy icon and
  // fall row-clicks back to navigate so the row still has an action.
  const [canCopy, setCanCopy] = useState(true);
  useEffect(() => {
    if (
      typeof navigator === 'undefined' ||
      !navigator.clipboard ||
      typeof navigator.clipboard.writeText !== 'function'
    ) {
      setCanCopy(false);
    }
  }, []);

  const [justCopied, setJustCopied] = useState(false);
  const rowRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!justCopied) return;
    const onDocPointerDown = (e: Event) => {
      const target = e.target as Node | null;
      if (target && rowRef.current && rowRef.current.contains(target)) return;
      setJustCopied(false);
    };
    document.addEventListener('pointerdown', onDocPointerDown);
    return () => document.removeEventListener('pointerdown', onDocPointerDown);
  }, [justCopied]);

  const handleCopy = useCallback(() => {
    // Always copy the plain hex so the clipboard matches the hover label the
    // user just read. The "Copy as" format preference still drives Export and
    // the multi-color palette grid - it just doesn't reformat single-row clicks.
    const text = shade.hex;
    if (
      typeof navigator === 'undefined' ||
      !navigator.clipboard ||
      typeof navigator.clipboard.writeText !== 'function'
    ) {
      pushToast("Couldn't copy - clipboard is unavailable in this browser.");
      return;
    }
    navigator.clipboard.writeText(text).then(
      () => {
        // Only fire the success toast (and notify the parent) after the
        // write actually resolved - otherwise the user sees "Copied" but
        // nothing's on their clipboard. The parent's onCopy callback is
        // still useful as a "row was successfully copied" signal.
        pushToast(`Copied ${text}`);
        onCopy(shade.hex);
        setJustCopied(true);
      },
      () => {
        // Common rejection causes: insecure (HTTP) context, document not
        // focused, denied permission (Safari private, sandboxed iframes).
        pushToast("Couldn't copy - check browser permissions.");
      },
    );
  }, [shade.hex, onCopy, pushToast]);

  const handleClick = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      if ((e.target as HTMLElement).closest('a')) return;
      // A fast double-click fires `click` twice. There's no double-click action
      // anymore, but ignoring the second one keeps a double-tap from firing two
      // copy toasts / two inspects. Must come before the modifier branch below.
      if (e.detail > 1) return;
      // Modifier-click opens the shade's own page in a new tab - this is a
      // separate page, not an in-place source swap (the row is a div, so we
      // replicate the browser's native cmd/ctrl-click-a-link behavior).
      if (e.metaKey || e.ctrlKey) {
        window.open(navHref, '_blank', 'noopener,noreferrer');
        return;
      }
      // Load the clicked shade into the top picker / preview either way. With
      // clipboard available we also copy; without it, inspect is the row's
      // only action (so it isn't a dead element).
      if (canCopy) handleCopy();
      onInspect(shade.hex);
    },
    [handleCopy, canCopy, onInspect, shade.hex, navHref],
  );

  // Middle-click opens the shade page in a new tab (the browser default for a
  // real link; replicated here because the row is a div, not an anchor).
  const handleAuxClick = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      if (e.button === 1) {
        e.preventDefault();
        window.open(navHref, '_blank', 'noopener,noreferrer');
      }
    },
    [navHref],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        // Mirror a plain click: copy (when available) + load into the picker.
        if (canCopy) handleCopy();
        onInspect(shade.hex);
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const dir = e.key === 'ArrowDown' ? 1 : -1;
        const rows = Array.from(
          document.querySelectorAll<HTMLDivElement>('[data-shade-row="true"]'),
        );
        const idx = rows.indexOf(e.currentTarget);
        const next = rows[idx + dir];
        if (next) next.focus();
      }
    },
    [shade.hex, handleCopy, canCopy, onInspect],
  );

  // WCAG 2.5.3 (Label in Name) requires the accessible name to start with
  // the visible label text - formatted value + (optional) stop + (optional) "source".
  const visibleLabel = [
    displayValue,
    shade.stop !== undefined ? String(shade.stop) : '',
    shade.isInput ? 'source' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const ariaLabel = canCopy
    ? `${visibleLabel}. Click to copy${shade.isInput ? ' (pinned source)' : ''}`
    : `${visibleLabel}. Click to view${shade.isInput ? ' (pinned source)' : ''}`;

  return (
    <div className="group relative">
    {/* Row-label gutter: Tailwind stop (50…950) or the OKLCH ramp's matching 50…950 stop,
        absolutely positioned just past the row's right edge so it lives in the
        page padding and never disturbs the row's layout box. `inset-y-0` +
        `items-center` keeps it centred on the row regardless of the row's
        natural height. Decorative - the stop is already in the row's aria-label
        and each swatch's copy value. Mirrors the multi-color grid's gutter. */}
    {gutterLabel != null && (
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-full flex items-center whitespace-nowrap pl-2 font-mono text-[11px] uppercase tracking-[0.14em] tabular-nums text-mute sm:pl-3"
      >
        {gutterLabel}
      </div>
    )}
    <div
      ref={rowRef}
      data-shade-row="true"
      data-hex={shade.hex}
      role="button"
      tabIndex={0}
      aria-label={ariaLabel}
      onClick={handleClick}
      onAuxClick={handleAuxClick}
      onKeyDown={handleKeyDown}
      style={
        showSourceBand
          ? {
              backgroundColor: shade.hex,
              backgroundImage: `linear-gradient(to right, ${sourceHex} 20%, ${shade.hex} 20%)`,
            }
          : { backgroundColor: shade.hex }
      }
      className={[
        // Same left padding on every row so the hex label (and the source
        // row's SOURCE badge) line up with one another. Non-source rows
        // paint a 20% source-color band underneath via the linear-gradient
        // background; source row paints solid color.
        'group relative flex w-full items-center justify-between gap-3 py-3.5 pr-5 pl-[calc(20%+0.75rem)]',
        'cursor-pointer select-none',
        'motion-safe:transition-[box-shadow,transform] motion-safe:duration-150 motion-safe:ease-out',
        // A persistent transparent ring keeps `box-shadow` declared at rest so
        // the hover/focus ring fades its color in and out instead of snapping -
        // box-shadow can't transition from `none`.
        'ring-2 ring-transparent',
        'focus-visible:outline-none focus-visible:ring-current focus-visible:ring-offset-2 focus-visible:ring-offset-transparent',
        // Hover ring follows the page theme, not the swatch: `ring-ink` is the
        // `--color-ink` token - near-black in light mode, near-white in dark.
        'hover:z-20 hover:ring-ink',
        // Source row sits above its neighbors. The visual horizontal
        // overflow is drawn by two absolute spans inside the row (below)
        // so the row's layout box stays the same size as its siblings and
        // the hex label / SOURCE badge stay pixel-aligned with the rest.
        shade.isInput ? 'relative z-10' : '',
        fgClass,
      ].join(' ')}
    >
      {/* Source-row only: two absolute spans extend the visible row a
          few pixels past its left and right edges so the source row reads
          as elevated above its neighbors. They sit OUTSIDE the row's
          layout box, so the row's padding and content positions stay
          identical to sibling rows. */}
      {shade.isInput && (
        <>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 -left-2 w-2"
            style={{ backgroundColor: shade.hex }}
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 -right-2 w-2"
            style={{ backgroundColor: shade.hex }}
          />
        </>
      )}
      <div className="flex shrink-0 items-center gap-4 font-mono text-sm">
        {/* Stop / index values moved out to the right gutter (below) so the
            single-color view matches the multi-color grid. Only the Source
            badge stays inside the row. */}
        {shade.isInput && (
          <span className="flex items-center gap-1.5">
            <span
              className={
                'px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] ' +
                (fg === 'white' ? 'bg-white text-black' : 'bg-black text-white')
              }
            >
              Source
            </span>
            <SourceInfoButton fg={fg} />
          </span>
        )}
      </div>

      <div className="flex min-w-0 flex-1 items-center justify-end gap-3">
        <span
          aria-hidden="true"
          className={[
            'shrink-0 whitespace-nowrap rounded-sm px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em]',
            // Always visible on touch-only devices; faded-in on hover-capable
            // ones via the .pointer-fine-hide CSS utility in global.css.
            'pointer-fine-hide',
            fg === 'white' ? 'bg-white/15 text-white' : 'bg-black/10 text-black',
          ].join(' ')}
        >
          {canCopy ? (justCopied ? 'Copied' : 'Click to copy') : 'Click to view'}
        </span>
        {/* Value text hides at rest on hover-capable devices and fades in on
            row hover/focus (same `.pointer-fine-hide` utility as the badge
            above); always visible on touch. Keeps the strip swatch-first. */}
        <span className="pointer-fine-hide min-w-0 truncate font-mono text-sm tracking-tight tabular-nums">{displayValue}</span>
      </div>
    </div>
    {!shade.isInput && (
      // Display:none crawlable link to the shade's own page. It carries no
      // click handler - clicking a shade no longer swaps the source in place
      // (that gesture was removed); this stays purely so search crawlers find
      // an <a href> to each sibling hex page for internal linking. Users open
      // a shade's page via cmd/ctrl/middle-click on the row (see handleClick /
      // handleAuxClick), which the row replicates against the same `navHref`.
      <a
        href={navHref}
        aria-label={`Open shade ${shade.hex}`}
        title="Open shade page"
        className="hidden"
      >
        <OpenIcon />
      </a>
    )}
    </div>
  );
}

/**
 * Memoized so a hex change (which recomputes the whole ramp/scale array and
 * hands every row a fresh `shade` object identity) only re-renders the rows
 * whose rendered output actually differs. The callbacks are stable
 * `useCallback`s in the parent, so we compare just the value-bearing fields:
 * the shade's hex/stop/isInput, the source band color, and the gutter label.
 * `sourceHex` is included because every non-source row paints it in its 20%
 * band, so it changes every row's output.
 */
function shadeRowPropsEqual(a: ShadeRowProps, b: ShadeRowProps): boolean {
  return (
    a.shade.hex === b.shade.hex &&
    a.shade.stop === b.shade.stop &&
    a.shade.isInput === b.shade.isInput &&
    a.sourceHex === b.sourceHex &&
    a.gutterLabel === b.gutterLabel &&
    a.onCopy === b.onCopy &&
    a.onInspect === b.onInspect
  );
}

export default memo(ShadeRow, shadeRowPropsEqual);

function OpenIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="h-4 w-4">
      <path d="M11.2 1.6a2.2 2.2 0 0 1 3.1 3.1l-1.4 1.4-3.1-3.1 1.4-1.4Z" fill="currentColor" />
      <path d="m9.1 3.7 3.1 3.1-6.6 6.6-3.1-.5L2 9.8 9.1 3.7Z" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" />
    </svg>
  );
}
