import {
  memo,
  useCallback,
  useMemo,
  useRef,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';
import type { CopyFormat, Hex, Shade } from '../lib/color/types';
import { contrastRatio } from '../lib/color/contrast';
import { formatForCopy } from '../lib/color/format';
import { oklchRamp } from '../lib/color/ramp';
import { buildScale } from '../lib/color/scale';
import { STOPS } from '../lib/color/anchors';
import { paletteColumnGrows } from '../lib/palette-weights';
import { useToast } from './Toast';
import SourceInfoButton from './SourceInfoButton';

/**
 * Multi-column shade grid shown in place of the single ramp once the palette
 * tray holds two or more colors. Each palette color gets its own column - the
 * full OKLCH ramp (`kind="ramp"`) or 11-stop Tailwind scale (`kind="scale"`) -
 * separated by a 2px vertical gap (matching the rows' `gap-[2px]`) so the grid
 * reads as a clean lattice. Column widths come from `paletteColumnGrows`: the
 * user-color prefix keeps ≥50% of the width and the seeded suffix shares the
 * rest (equal within each group), matching the `PalettePreviewBar` above.
 *
 * Unlike `ShadeRow`, swatches here carry no value label and no source band:
 * the column IS the color, so the only chrome is the `Source` badge on the
 * pinned input shade. Interaction parity with `ShadeRow` is kept (click to
 * copy, double-click / Shift+Enter to use as source, modifier / middle click
 * to open the shade's page).
 *
 * Each row additionally gets a label printed once at its right end, in an
 * absolutely-positioned column that floats into the page's right gutter
 * (`left-full`) - OUTSIDE the `overflow-hidden` swatch lattice. In
 * `kind="scale"` (Tailwind) mode the label is the stop value (50…950); in
 * `kind="ramp"` (OKLCH) it's the same 50…950 stop labels by row index, since the ramp has
 * no stops. It's positioned rather than added as a flex sibling on purpose: a
 * trailing in-flow column would shrink every swatch column and progressively
 * knock them out of alignment with the `PalettePreviewBar` name headers above.
 *
 * Each swatch is a fixed `ROW_H` tall - the same height as a single-column
 * `ShadeRow` (its `py-3.5` + text line ≈ 48px) - and the container sizes to its
 * content rather than dividing a fixed height across the rows. So a column here
 * reads at exactly the same row height as the single-color ramp/scale, just
 * without the per-row value labels.
 */

// Matches a single-column ShadeRow's rendered height (py-3.5 + text-sm line).
const ROW_H = 'h-12';

const WHITE = '#ffffff';
const BLACK = '#000000';

// Diagonal-stripe fill for an in-flight band "+" placeholder column (mirrors the
// same fill in PalettePreviewBar). Mid-gray at low opacity so it reads on both
// themes without showing any real color until the user picks one.
const PENDING_STRIPE =
  'repeating-linear-gradient(45deg, rgba(128,128,128,0.07) 0, rgba(128,128,128,0.07) 6px, transparent 6px, transparent 12px)';

function pickForeground(hex: Hex): 'white' | 'black' {
  return contrastRatio(hex, WHITE) >= contrastRatio(hex, BLACK) ? 'white' : 'black';
}

export interface PaletteShadeGridProps {
  /** Palette colors, in tray order - one column each. */
  hexes: Hex[];
  /**
   * Family name per column, parallel to `hexes` — the swatch's effective
   * semantic name (the user's rename, else "Primary"/"Secondary"/"Accent"/a seeded role),
   * matching the preview-bar header above and the exported token family. Each
   * column's copy labels (var(--name)/bg-name) use its own column's name rather
   * than the active color's. Falls back to `brandName` when absent.
   */
  names?: string[];
  /** `ramp` = OKLCH continuous ramp, `scale` = 11-stop Tailwind scale. */
  kind: 'ramp' | 'scale';
  copyFormat: CopyFormat;
  brandName?: string;
  onCopy: (hex: Hex) => void;
  onNavigate: (hex: Hex) => void;
  /**
   * Column index where the auto-seeded semantic block (Neutral/…) begins. The
   * column at this index gets a left gap so the grid's user↔semantic divide
   * lines up with the `PalettePreviewBar` band above. Omit (or 0 / ≥ length) for
   * no gap.
   */
  boundary?: number;
  /**
   * Column index of an in-flight band "+" placeholder (or -1 / omitted). That
   * column renders a striped "pick a color" placeholder instead of a real ramp,
   * so no default seed color is shown until the user picks one. Its hex in
   * `hexes` is still a valid color (the picker seed) and is ignored here.
   */
  pendingIndex?: number;
  /**
   * Hex of the color just added to the tray, if any. The matching column fades
   * in (`palette-column-enter`); keyed by hex (not index) because new brand
   * colors are inserted before the seeded block, not appended. Cleared by the
   * owner shortly after, so it only fires on add - never on reorder, hex edits,
   * image-drag, or an algorithm-view toggle that remounts the grid.
   */
  enterHex?: Hex | null;
}

export default function PaletteShadeGrid({
  hexes,
  names,
  kind,
  copyFormat,
  brandName,
  onCopy,
  onNavigate,
  boundary,
  pendingIndex,
  enterHex,
}: PaletteShadeGridProps) {
  // Mirror PalettePreviewBar's gap: only when both groups are actually present.
  const hasGap = boundary != null && boundary > 0 && boundary < hexes.length;
  // Mirror PalettePreviewBar's column widths: the user-color prefix keeps ≥50%
  // of the width, the seeded suffix shares the rest (equal within each group).
  const grows = paletteColumnGrows(hexes.length, boundary ?? hexes.length);
  // Build each column's shades keyed by that column's OWN hex (+ kind), reusing
  // the prior computation for any hex that didn't change. During an image-mode
  // point drag only ONE column's hex changes per frame, but the tray's array
  // identity changes every frame - so a plain `hexes.map(...)` rebuilt EVERY
  // column's ramp/scale (~30 culori toGamut calls each) on every move. This
  // per-hex cache rebuilds only the dragged column; the others are returned
  // from the cache untouched. The cache is pruned to the current hex set each
  // pass so it can't grow unbounded.
  const shadeCacheRef = useRef<Map<string, Shade[]>>(new Map());
  const columns = useMemo(() => {
    const cache = shadeCacheRef.current;
    const next = new Map<string, Shade[]>();
    const cols = hexes.map((hex) => {
      const key = `${kind}:${hex}`;
      let shades = cache.get(key);
      if (!shades) {
        shades = kind === 'ramp' ? oklchRamp(hex).shades : buildScale(hex).shades;
      }
      // Preserve a single cache entry per key even if a color repeats.
      next.set(key, shades);
      return shades;
    });
    shadeCacheRef.current = next;
    return cols;
  }, [hexes, kind]);

  // Per-row gutter labels. Tailwind scale: the stop values (50…950), read
  // straight off the rendered rows so they can't drift from the swatches. OKLCH
  // ramp: the same 50…950 stop labels by row index (ramp shades have no `stop`
  // of their own, but the ramp is sized to match `STOPS`). Every column shares
  // the same row order, so column 0 is representative.
  const rowLabels =
    kind === 'scale'
      ? (columns[0] ?? []).map((s) => s.stop)
      : (columns[0] ?? []).map((_, i) => STOPS[i] ?? i + 1);

  return (
    <div className="relative">
      <div
        role="list"
        data-palette-grid="true"
        data-grid-columns={hexes.length}
        aria-label={kind === 'ramp' ? 'Palette OKLCH ramps' : 'Palette Tailwind scales'}
        className="flex w-full gap-[2px] overflow-hidden"
      >
        {columns.map((shades, col) =>
          col === pendingIndex ? (
            // In-flight "+" placeholder column: striped "pick a color" cells
            // (one per row so heights line up with the real columns) instead of
            // a ramp, so no default seed color is shown until the user picks.
            <div
              role="listitem"
              key={`pending-${col}`}
              aria-label="New color (pick one)"
              style={{ flexGrow: grows[col], flexBasis: 0 }}
              className={
                'relative flex min-w-0 flex-col gap-[2px]' +
                (hasGap && col === boundary ? ' ml-12' : '')
              }
            >
              {shades.map((_, row) => (
                <div
                  key={`pending-${row}`}
                  className={`flex ${ROW_H} items-center border border-dashed border-hairline`}
                  style={{ backgroundImage: PENDING_STRIPE }}
                />
              ))}
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <span className="font-display text-[11px] font-medium uppercase tracking-[0.12em] text-mute/70">
                  Pick a color
                </span>
              </div>
            </div>
          ) : (
            <div
              role="listitem"
              key={`${hexes[col]}-${col}`}
              aria-label={`Shades of ${hexes[col]}`}
              style={{ flexGrow: grows[col], flexBasis: 0 }}
              className={
                'flex min-w-0 flex-col gap-[2px]' +
                (hasGap && col === boundary ? ' ml-12' : '') +
                (enterHex && hexes[col] === enterHex ? ' palette-column-enter' : '')
              }
            >
              {shades.map((shade, row) => (
                <MemoGridSwatch
                  key={`${shade.hex}-${row}`}
                  shade={shade}
                  col={col}
                  row={row}
                  copyFormat={copyFormat}
                  brandName={names?.[col] ?? brandName}
                  onCopy={onCopy}
                  onNavigate={onNavigate}
                />
              ))}
            </div>
          ),
        )}
      </div>
      {/* Row-label gutter: Tailwind stop value (50…950); the OKLCH ramp keys to
          the same 50…950 stops. Absolutely positioned just past the grid's right edge so it
          lives in the page padding and never disturbs the flex-1 swatch
          columns. Each cell mirrors a swatch's `ROW_H` + `gap-[2px]` rhythm,
          top-anchored, so the labels line up row-for-row. Decorative: for the
          scale the stop is already part of each swatch's copy value. */}
      {rowLabels.length > 0 && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-full top-0 flex flex-col gap-[2px] pl-2 sm:pl-3"
        >
          {rowLabels.map((label, row) => (
            <div
              key={`row-${label}-${row}`}
              className={`flex ${ROW_H} items-center whitespace-nowrap font-mono text-[11px] uppercase tracking-[0.14em] tabular-nums text-mute`}
            >
              {label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface GridSwatchProps {
  shade: Shade;
  /** Column (palette-color) and row (stop) index, for arrow-key navigation. */
  col: number;
  row: number;
  copyFormat: CopyFormat;
  brandName?: string;
  onCopy: (hex: Hex) => void;
  onNavigate: (hex: Hex) => void;
}

function GridSwatch({
  shade,
  col,
  row,
  copyFormat,
  brandName,
  onCopy,
  onNavigate,
}: GridSwatchProps) {
  const fg = useMemo(() => pickForeground(shade.hex), [shade.hex]);
  const navHref = `/${shade.hex.slice(1)}`;
  const { pushToast } = useToast();

  const handleCopy = useCallback(() => {
    // Always copy the plain hex so a click matches the hover label (parity with
    // ShadeRow). The "Copy as" format preference still drives Export, not the
    // grid swatch click.
    const text = shade.hex;
    if (
      typeof navigator === 'undefined' ||
      !navigator.clipboard ||
      typeof navigator.clipboard.writeText !== 'function'
    ) {
      // No clipboard - tell the user why, then fall the action back to
      // navigation so the swatch isn't a dead element (parity with ShadeRow).
      pushToast("Couldn't copy - clipboard is unavailable in this browser.");
      onNavigate(shade.hex);
      return;
    }
    navigator.clipboard.writeText(text).then(
      () => {
        pushToast(`Copied ${text}`);
        onCopy(shade.hex);
      },
      () => pushToast("Couldn't copy - check browser permissions."),
    );
  }, [shade.hex, onCopy, onNavigate, pushToast]);

  const handleClick = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      // The second click of a double-click also fires `click`; guard so we
      // don't copy (or open a tab) before dblclick runs.
      if (e.detail > 1) return;
      if (e.metaKey || e.ctrlKey) {
        window.open(navHref, '_blank', 'noopener,noreferrer');
        return;
      }
      handleCopy();
    },
    [handleCopy, navHref],
  );

  const handleAuxClick = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      if (e.button === 1) {
        e.preventDefault();
        window.open(navHref, '_blank', 'noopener,noreferrer');
      }
    },
    [navHref],
  );

  const handleDoubleClick = useCallback(() => onNavigate(shade.hex), [shade.hex, onNavigate]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (e.shiftKey) onNavigate(shade.hex);
        else handleCopy();
        return;
      }
      // Arrow keys move focus across the 2D grid: Up/Down within a column,
      // Left/Right across columns at the same stop depth. No wrap at edges -
      // a missing target (clamped past the boundary) is simply a no-op.
      const moves: Record<string, [number, number]> = {
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
      };
      const delta = moves[e.key];
      if (!delta) return;
      e.preventDefault();
      const [dc, dr] = delta;
      const next = document.querySelector<HTMLDivElement>(
        `[data-grid-swatch="true"][data-grid-col="${col + dc}"][data-grid-row="${row + dr}"]`,
      );
      if (next) next.focus();
    },
    [shade.hex, handleCopy, onNavigate, col, row],
  );

  // Memoized so the per-frame parent re-render during a drag doesn't re-run
  // `formatForCopy` (and rebuild the aria string) for every unchanged swatch.
  const valueLabel = useMemo(
    () => formatForCopy(shade.hex, copyFormat, { name: brandName, stop: shade.stop }),
    [shade.hex, shade.stop, copyFormat, brandName],
  );
  const ariaLabel = useMemo(
    () =>
      `${valueLabel}${shade.isInput ? ' source' : ''}. Click to copy, double-click or Shift+Enter to use as source`,
    [valueLabel, shade.isInput],
  );

  return (
    <div
      data-grid-swatch="true"
      data-grid-col={col}
      data-grid-row={row}
      data-hex={shade.hex}
      role="button"
      tabIndex={0}
      aria-label={ariaLabel}
      onClick={handleClick}
      onAuxClick={handleAuxClick}
      onDoubleClick={handleDoubleClick}
      onKeyDown={handleKeyDown}
      style={{ backgroundColor: shade.hex }}
      className={[
        `group relative flex ${ROW_H} items-center px-2`,
        'cursor-pointer select-none',
        'ring-2 ring-transparent ring-inset',
        'focus-visible:outline-none focus-visible:ring-current',
        'hover:z-10 hover:ring-ink',
        fg === 'white' ? 'text-white' : 'text-black',
      ].join(' ')}
    >
      {/* Hover hex readout. The swatch's `fg` (white/black, whichever wins the
          WCAG contrast check against the swatch color) is already applied to
          the swatch's text color, so the label stays legible on any shade.
          Decorative - the hex is in `aria-label`/`title` already. Hidden on the
          source swatch, whose persistent "Source" badge owns that corner. */}
      {!shade.isInput && (
        <span
          aria-hidden="true"
          className="pointer-events-none ml-auto font-mono text-[13px] tabular-nums opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
        >
          {shade.hex}
        </span>
      )}
      {shade.isInput && (
        <span className="flex min-w-0 items-center gap-1.5">
          {/* Source marker: an 8px dot in the swatch's chosen foreground
              (white/black, whichever wins the WCAG contrast check) so it stays
              legible on any color - same logic as the swatch text. The word
              "source" still lives in the swatch's aria-label, so the dot is
              decorative. */}
          <span
            aria-hidden="true"
            className={
              'h-2 w-2 shrink-0 rounded-full ' +
              (fg === 'white' ? 'bg-white' : 'bg-black')
            }
          />
          {/* Only the first (primary) column carries the explainer - the
              "source" concept is identical for every column, so one icon is
              enough and avoids cluttering every palette color. */}
          {col === 0 && <SourceInfoButton fg={fg} />}
        </span>
      )}
    </div>
  );
}

/**
 * Memoized so an image-drag re-render of the grid (every frame the active hex /
 * tray changes) only re-renders the swatches whose own data changed - i.e. the
 * dragged column's. The callbacks are stable in the orchestrator; we compare
 * the value-bearing fields plus the grid coordinates the keyboard handler reads.
 */
const MemoGridSwatch = memo(GridSwatch, (a, b) =>
  a.shade.hex === b.shade.hex &&
  a.shade.stop === b.shade.stop &&
  a.shade.isInput === b.shade.isInput &&
  a.col === b.col &&
  a.row === b.row &&
  a.copyFormat === b.copyFormat &&
  a.brandName === b.brandName &&
  a.onCopy === b.onCopy &&
  a.onNavigate === b.onNavigate,
);
