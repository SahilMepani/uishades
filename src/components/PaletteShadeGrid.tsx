import {
  useCallback,
  useMemo,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';
import type { CopyFormat, Hex, Shade } from '../lib/color/types';
import { contrastRatio } from '../lib/color/contrast';
import { formatForCopy } from '../lib/color/format';
import { oklchRamp } from '../lib/color/ramp';
import { buildScale } from '../lib/color/scale';
import { useToast } from './Toast';

/**
 * Multi-column shade grid shown in place of the single ramp once the palette
 * tray holds two or more colors. Each palette color gets its own column - the
 * full OKLCH ramp (`kind="ramp"`) or 11-stop Tailwind scale (`kind="scale"`) -
 * and the columns are equal-width (`flex-1`), separated by a 2px vertical gap
 * (matching the rows' `gap-[2px]`) so the grid reads as a clean lattice.
 *
 * Unlike `ShadeRow`, swatches here carry no value label and no source band:
 * the column IS the color, so the only chrome is the `Source` badge on the
 * pinned input shade. Interaction parity with `ShadeRow` is kept (click to
 * copy, double-click / Shift+Enter to use as source, modifier / middle click
 * to open the shade's page).
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

function pickForeground(hex: Hex): 'white' | 'black' {
  return contrastRatio(hex, WHITE) >= contrastRatio(hex, BLACK) ? 'white' : 'black';
}

export interface PaletteShadeGridProps {
  /** Palette colors, in tray order - one column each. */
  hexes: Hex[];
  /**
   * Brand name per column, parallel to `hexes` (nearest-named slug). Each
   * column's copy labels (var(--name)/bg-name) use its own color's name rather
   * than the active color's. Falls back to `brandName` when absent.
   */
  names?: string[];
  /** `ramp` = OKLCH continuous ramp, `scale` = 11-stop Tailwind scale. */
  kind: 'ramp' | 'scale';
  copyFormat: CopyFormat;
  brandName?: string;
  onCopy: (hex: Hex) => void;
  onNavigate: (hex: Hex) => void;
}

export default function PaletteShadeGrid({
  hexes,
  names,
  kind,
  copyFormat,
  brandName,
  onCopy,
  onNavigate,
}: PaletteShadeGridProps) {
  const columns = useMemo(
    () =>
      hexes.map((hex) =>
        kind === 'ramp' ? oklchRamp(hex).shades : buildScale(hex).shades,
      ),
    [hexes, kind],
  );

  return (
    <div
      role="list"
      data-palette-grid="true"
      data-grid-columns={hexes.length}
      aria-label={kind === 'ramp' ? 'Palette OKLCH ramps' : 'Palette Tailwind scales'}
      className="flex w-full gap-[2px] overflow-hidden border-b border-ink/15"
    >
      {columns.map((shades, col) => (
        <div
          role="listitem"
          key={`${hexes[col]}-${col}`}
          aria-label={`Shades of ${hexes[col]}`}
          className="flex min-w-0 flex-1 flex-col gap-[2px]"
        >
          {shades.map((shade, row) => (
            <GridSwatch
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
      ))}
    </div>
  );
}

function GridSwatch({
  shade,
  col,
  row,
  copyFormat,
  brandName,
  onCopy,
  onNavigate,
}: {
  shade: Shade;
  /** Column (palette-color) and row (stop) index, for arrow-key navigation. */
  col: number;
  row: number;
  copyFormat: CopyFormat;
  brandName?: string;
  onCopy: (hex: Hex) => void;
  onNavigate: (hex: Hex) => void;
}) {
  const fg = useMemo(() => pickForeground(shade.hex), [shade.hex]);
  const navHref = `/${shade.hex.slice(1)}`;
  const { pushToast } = useToast();

  const handleCopy = useCallback(() => {
    const text = formatForCopy(shade.hex, copyFormat, {
      name: brandName,
      stop: shade.stop,
    });
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
  }, [shade.hex, shade.stop, copyFormat, brandName, onCopy, onNavigate, pushToast]);

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

  const valueLabel = formatForCopy(shade.hex, copyFormat, {
    name: brandName,
    stop: shade.stop,
  });
  const ariaLabel = `${valueLabel}${shade.isInput ? ' source' : ''}. Click to copy, double-click or Shift+Enter to use as source`;

  return (
    <div
      data-grid-swatch="true"
      data-grid-col={col}
      data-grid-row={row}
      data-hex={shade.hex}
      role="button"
      tabIndex={0}
      aria-label={ariaLabel}
      title={valueLabel}
      onClick={handleClick}
      onAuxClick={handleAuxClick}
      onDoubleClick={handleDoubleClick}
      onKeyDown={handleKeyDown}
      style={{ backgroundColor: shade.hex }}
      className={[
        `relative flex ${ROW_H} items-center px-2`,
        'cursor-pointer select-none',
        'ring-2 ring-transparent ring-inset',
        'focus-visible:outline-none focus-visible:ring-current',
        'hover:z-10 hover:ring-ink',
        fg === 'white' ? 'text-white' : 'text-black',
      ].join(' ')}
    >
      {shade.isInput && (
        <span
          className={
            'min-w-0 truncate px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] ' +
            (fg === 'white' ? 'bg-white text-black' : 'bg-black text-white')
          }
        >
          Source
        </span>
      )}
    </div>
  );
}
