/**
 * Client-side PNG export of a shade ramp or Tailwind scale.
 *
 * Draws the palette as a stack of full-width colour bands - one per shade,
 * lightest → darkest, mirroring the on-screen order - each labelled with its
 * hex value (and its Tailwind stop, when present) in a contrast-appropriate
 * ink, the source/anchor shade marked with a SOURCE badge, and a centred
 * "UIshades.com" footer wordmark. The multi-color grid (see `columns` below)
 * drops the per-band hex/stop labels - its columns are bare color bands with
 * only the SOURCE badge, matching the on-screen `PaletteShadeGrid`.
 *
 * This module is deliberately imported *lazily* from the React island (via a
 * dynamic `import()` inside the download click handler) so the canvas-drawing
 * code never lands in the eager continuous-ramp chunk - only on-click, when
 * a PNG is actually being produced. Keep it free of static imports from any
 * eager-path module.
 *
 * The drawing function takes a plain `Shade[]`, so it serves both the
 * continuous ramp and the 11-stop Tailwind scale. When a multi-color palette
 * is active it instead takes `columns` (one `Shade[]` per palette color) and
 * lays them out as a column-per-color grid, mirroring the on-screen
 * `PaletteShadeGrid`, so the export covers every color - not just the active one.
 */
import { contrastRatio } from '../color/contrast';
import type { Hex, Shade } from '../color/types';

// Brand palette (kept in sync with the @theme tokens in global.css).
const INK = '#111110';
const PAPER = '#faf8f3';
const WHITE = '#ffffff';
const BLACK = '#0a0a0a';

// Logical layout (pre-devicePixelRatio). Heights chosen so 20 ramp rows plus
// the footer compose a comfortable portrait card.
const WIDTH = 680;
const ROW_HEIGHT = 48;
const FOOTER_HEIGHT = 56;
const PAD_X = 24;
const STOP_SLOT = 52; // horizontal room reserved for the Tailwind stop label

// Multi-color grid layout: one column per palette color, equal width, with a
// 2px gutter between them (matching the on-screen PaletteShadeGrid's gap).
// Columns carry no hex/stop labels (just the SOURCE badge), so they're kept
// narrow - wide enough for the badge - rather than the single stack's width.
const COL_WIDTH = 170;
const COL_GAP = 2;

const MONO = "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
const SANS = "'Geist', system-ui, -apple-system, Segoe UI, sans-serif";

export interface RampPngOptions {
  /** Shades to draw, in display order (lightest → darkest). */
  shades: Shade[];
  /**
   * Multi-color palette: one `Shade[]` per palette color, in tray order. When
   * present with two or more entries the PNG renders a column-per-color grid
   * (mirroring the on-screen `PaletteShadeGrid`) instead of the single labelled
   * stack, so the export covers every color rather than only the active one.
   * `shades` is still used as a fallback for single-color exports.
   */
  columns?: Shade[][];
  /** The pinned source hex - used for the download filename. */
  sourceHex: Hex;
  /** Filename suffix tagging the palette kind, e.g. 'oklch' | 'classic' | 'scale'. */
  variant: string;
}

/** Foreground ink that reads best over `hex` - matches ShadeRow's rule. */
function pickForeground(hex: Hex): string {
  return contrastRatio(hex, WHITE) >= contrastRatio(hex, BLACK) ? WHITE : BLACK;
}

/**
 * Render the palette to a PNG `Blob`. Resolves with the encoded image; rejects
 * if a 2D context or `toBlob` is unavailable (very old / headless browsers).
 */
export function rampToPngBlob({ shades, columns }: RampPngOptions): Promise<Blob> {
  // A 2+-color palette draws a column-per-color grid; otherwise the single
  // labelled stack. Fall back to `[shades]` so a 0/1-entry `columns` still works.
  const grid = columns && columns.length >= 2 ? columns : null;

  const dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
  const rows = grid
    ? Math.max(...grid.map((col) => col.length))
    : shades.length;
  const logicalWidth = grid
    ? grid.length * COL_WIDTH + (grid.length - 1) * COL_GAP
    : WIDTH;
  const logicalHeight = rows * ROW_HEIGHT + FOOTER_HEIGHT;

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(logicalWidth * dpr);
  canvas.height = Math.round(logicalHeight * dpr);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return Promise.reject(new Error('Canvas 2D context unavailable'));
  }
  ctx.scale(dpr, dpr);
  ctx.textBaseline = 'middle';

  // --- Shade bands ---------------------------------------------------------
  // The multi-color grid mirrors the on-screen PaletteShadeGrid: bare color
  // bands with only the SOURCE badge - no per-cell hex/stop labels (the column
  // IS the color). The single-color stack keeps its hex/stop labels.
  if (grid) {
    grid.forEach((col, c) => {
      const x0 = c * (COL_WIDTH + COL_GAP);
      col.forEach((shade, i) => {
        drawBand(ctx, shade, x0, i * ROW_HEIGHT, COL_WIDTH, false);
      });
    });
  } else {
    shades.forEach((shade, i) => {
      drawBand(ctx, shade, 0, i * ROW_HEIGHT, WIDTH, true);
    });
  }

  // --- Footer wordmark -----------------------------------------------------
  const footerY = rows * ROW_HEIGHT;
  ctx.fillStyle = INK;
  ctx.fillRect(0, footerY, logicalWidth, FOOTER_HEIGHT);

  ctx.fillStyle = PAPER;
  ctx.font = `700 14px ${SANS}`;
  ctx.textAlign = 'center';
  const supportsTracking = 'letterSpacing' in ctx;
  if (supportsTracking) ctx.letterSpacing = '1px';
  ctx.fillText('UIshades.com', logicalWidth / 2, footerY + FOOTER_HEIGHT / 2);
  if (supportsTracking) ctx.letterSpacing = '0px';

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Canvas toBlob() returned null'));
    }, 'image/png');
  });
}

/**
 * Draw one full-width shade band at (`x0`, `y`) spanning `width`: the fill and
 * the SOURCE badge on the pinned input shade. When `showLabels` is true it also
 * paints the Tailwind stop label (when present) and the hex value in a
 * contrast-appropriate ink; the multi-color grid passes `false` so its columns
 * are bare color bands (no hex/stop text), matching the on-screen grid. The
 * SOURCE badge sits flush-left in label-less mode (parity with the grid swatch)
 * and flush-right alongside the labels otherwise.
 */
function drawBand(
  ctx: CanvasRenderingContext2D,
  shade: Shade,
  x0: number,
  y: number,
  width: number,
  showLabels: boolean,
): void {
  ctx.fillStyle = shade.hex;
  ctx.fillRect(x0, y, width, ROW_HEIGHT);

  const fg = pickForeground(shade.hex);
  const midY = y + ROW_HEIGHT / 2;
  ctx.textAlign = 'left';

  if (showLabels) {
    let x = x0 + PAD_X;
    // Tailwind-scale shades carry a stop (50…950); show it ahead of the hex.
    if (shade.stop !== undefined) {
      ctx.fillStyle = fg;
      ctx.globalAlpha = 0.7;
      ctx.font = `600 12px ${SANS}`;
      ctx.fillText(String(shade.stop), x, midY);
      ctx.globalAlpha = 1;
      x += STOP_SLOT;
    }

    ctx.fillStyle = fg;
    ctx.font = `500 15px ${MONO}`;
    ctx.fillText(shade.hex.toUpperCase(), x, midY);
  }

  if (shade.isInput) {
    drawSourceBadge(ctx, x0, width, midY, fg, shade.hex, showLabels ? 'right' : 'left');
  }
}

/**
 * Inverted "SOURCE" pill within the band starting at `x0` spanning `width`,
 * `PAD_X`-inset from the chosen edge (`right` beside the labels, `left` for the
 * label-less grid columns).
 */
function drawSourceBadge(
  ctx: CanvasRenderingContext2D,
  x0: number,
  width: number,
  midY: number,
  fg: string,
  bandHex: Hex,
  align: 'left' | 'right',
): void {
  const label = 'SOURCE';
  ctx.font = `600 11px ${SANS}`;
  // `letterSpacing` is supported in all evergreen browsers; guard for old ones.
  const supportsTracking = 'letterSpacing' in ctx;
  if (supportsTracking) ctx.letterSpacing = '1.5px';
  const textW = ctx.measureText(label).width;
  const padX = 8;
  const badgeH = 20;
  const badgeW = textW + padX * 2;
  const x = align === 'right' ? x0 + width - PAD_X - badgeW : x0 + PAD_X;
  const y = midY - badgeH / 2;

  ctx.fillStyle = fg; // inverted: badge background is the row's ink colour
  ctx.fillRect(x, y, badgeW, badgeH);

  ctx.fillStyle = bandHex; // text is the band colour, so the pill reads inverted
  ctx.textAlign = 'left';
  ctx.fillText(label, x + padX, midY);
  if (supportsTracking) ctx.letterSpacing = '0px';
}

/**
 * Build the PNG and trigger a browser download. Filename is
 * `uishades-<hex-without-hash>-<variant>.png`. Object URL is revoked after the
 * click so the blob isn't leaked.
 */
export async function downloadRampPng(opts: RampPngOptions): Promise<void> {
  const blob = await rampToPngBlob(opts);
  const filename = `uishades-${opts.sourceHex.replace(/^#/, '')}-${opts.variant}.png`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke after the click has had a chance to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
