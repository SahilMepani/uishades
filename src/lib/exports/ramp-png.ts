/**
 * Client-side PNG export of a shade ramp or Tailwind scale.
 *
 * Draws the palette as a stack of full-width colour bands - one per shade,
 * lightest → darkest, mirroring the on-screen order - each labelled with its
 * hex value (and its Tailwind stop, when present) in a contrast-appropriate
 * ink, the source/anchor shade marked with a small foreground dot, and a
 * centred "UIshades.com" footer wordmark. The dot (never a text label) mirrors
 * the on-screen swatches. The multi-color grid (see `columns` below) drops the
 * per-band hex/stop labels too - its columns are bare color bands carrying only
 * the source dot, matching the on-screen `PaletteShadeGrid`.
 *
 * The footer wordmark follows the page theme: a light (paper) bar in light
 * mode, a dark (ink) bar in dark mode, read from `html.dark` at draw time. So
 * a PNG exported from the light-theme site isn't a dark-themed card.
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
// Columns carry no hex/stop labels (just the source dot), so they're kept
// narrow rather than at the single stack's width.
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

  // Follow the page theme for the footer wordmark band so a PNG exported from
  // the light-themed site doesn't come out as a dark-themed card. `html.dark`
  // is the site's theme flag (see ThemeToggle); default to light off-DOM.
  const isDark =
    typeof document !== 'undefined' &&
    document.documentElement.classList.contains('dark');

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
  // bands with only the source dot - no per-cell hex/stop labels (the column
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
  // Theme-aware: dark ink bar in dark mode, light paper bar in light mode, so
  // the card matches the site the user exported it from.
  const footerY = rows * ROW_HEIGHT;
  ctx.fillStyle = isDark ? INK : PAPER;
  ctx.fillRect(0, footerY, logicalWidth, FOOTER_HEIGHT);

  ctx.fillStyle = isDark ? PAPER : INK;
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
 * a source marker on the pinned input shade. When `showLabels` is true (the
 * single-color stack) it also paints the Tailwind stop label (when present) and
 * the hex value in a contrast-appropriate ink. The source shade is always
 * marked with a small foreground dot (never a text label) - flush-right in the
 * labelled stack so it clears the hex on the left, flush-left in the label-less
 * grid columns - mirroring the on-screen swatches, which show a dot.
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
    // Labelled stack: dot on the right so it clears the hex; grid: dot on the
    // left, matching the on-screen swatch.
    drawSourceDot(ctx, x0, width, midY, fg, showLabels ? 'right' : 'left');
  }
}

/**
 * Small source dot, mirroring the on-screen swatch's 8px foreground dot
 * (white/black, whichever wins the WCAG contrast check - already resolved into
 * `fg`). `PAD_X`-inset from the chosen edge of the band at `x0` spanning `width`.
 */
function drawSourceDot(
  ctx: CanvasRenderingContext2D,
  x0: number,
  width: number,
  midY: number,
  fg: string,
  align: 'left' | 'right',
): void {
  const radius = 4; // 8px diameter, matching the on-screen dot
  const cx = align === 'right' ? x0 + width - PAD_X - radius : x0 + PAD_X + radius;
  ctx.fillStyle = fg;
  ctx.beginPath();
  ctx.arc(cx, midY, radius, 0, Math.PI * 2);
  ctx.fill();
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
