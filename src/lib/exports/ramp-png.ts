/**
 * Client-side PNG export of a shade ramp or Tailwind scale.
 *
 * Draws the palette as a stack of full-width colour bands - one per shade,
 * lightest → darkest, mirroring the on-screen order - each labelled with its
 * hex value (and its Tailwind stop, when present) in a contrast-appropriate
 * ink, the source/anchor shade marked with a SOURCE badge, and a centred
 * "UIshades.com" footer wordmark.
 *
 * This module is deliberately imported *lazily* from the React island (via a
 * dynamic `import()` inside the download click handler) so the canvas-drawing
 * code never lands in the eager continuous-ramp chunk - only on-click, when
 * a PNG is actually being produced. Keep it free of static imports from any
 * eager-path module.
 *
 * The drawing function takes a plain `Shade[]`, so it serves both the
 * continuous ramp and the 11-stop Tailwind scale.
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

const MONO = "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
const SANS = "'Geist', system-ui, -apple-system, Segoe UI, sans-serif";

export interface RampPngOptions {
  /** Shades to draw, in display order (lightest → darkest). */
  shades: Shade[];
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
export function rampToPngBlob({ shades }: RampPngOptions): Promise<Blob> {
  const dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
  const logicalHeight = shades.length * ROW_HEIGHT + FOOTER_HEIGHT;

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(WIDTH * dpr);
  canvas.height = Math.round(logicalHeight * dpr);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return Promise.reject(new Error('Canvas 2D context unavailable'));
  }
  ctx.scale(dpr, dpr);
  ctx.textBaseline = 'middle';

  // --- Shade bands ---------------------------------------------------------
  shades.forEach((shade, i) => {
    const y = i * ROW_HEIGHT;
    ctx.fillStyle = shade.hex;
    ctx.fillRect(0, y, WIDTH, ROW_HEIGHT);

    const fg = pickForeground(shade.hex);
    const midY = y + ROW_HEIGHT / 2;
    ctx.textAlign = 'left';

    let x = PAD_X;
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

    if (shade.isInput) {
      drawSourceBadge(ctx, WIDTH - PAD_X, midY, fg, shade.hex);
    }
  });

  // --- Footer wordmark -----------------------------------------------------
  const footerY = shades.length * ROW_HEIGHT;
  ctx.fillStyle = INK;
  ctx.fillRect(0, footerY, WIDTH, FOOTER_HEIGHT);

  ctx.fillStyle = PAPER;
  ctx.font = `700 14px ${SANS}`;
  ctx.textAlign = 'center';
  const supportsTracking = 'letterSpacing' in ctx;
  if (supportsTracking) ctx.letterSpacing = '1px';
  ctx.fillText('UIshades.com', WIDTH / 2, footerY + FOOTER_HEIGHT / 2);
  if (supportsTracking) ctx.letterSpacing = '0px';

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Canvas toBlob() returned null'));
    }, 'image/png');
  });
}

/** Inverted "SOURCE" pill, right-aligned at (`rightX`, `midY`). */
function drawSourceBadge(
  ctx: CanvasRenderingContext2D,
  rightX: number,
  midY: number,
  fg: string,
  bandHex: Hex,
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
  const x = rightX - badgeW;
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
