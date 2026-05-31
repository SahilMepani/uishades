/**
 * Client-side PNG export of a mock preview.
 *
 * Draws the selected mock template's layout onto a canvas, coloured by the same
 * scoped `--mock-*` vars (via {@link computeMockVars}) the on-screen preview
 * uses, then a palette strip and a "UIshades.com" wordmark footer.
 *
 * Imported **lazily** from `MockPreview` (a dynamic `import()` inside the
 * download click handler) so the canvas code never lands in the eager bundle -
 * the same pattern as `ramp-png.ts`. Keep it free of static imports from any
 * eager-path module beyond the pure colour helpers it needs.
 */
import { computeMockVars } from '../../components/mocks/vars';
import type { MockColorInput, MockVars } from '../../components/mocks/types';

const SANS = "'Geist', system-ui, -apple-system, Segoe UI, sans-serif";

// Logical layout (pre-devicePixelRatio).
const WIDTH = 1000;
const STAGE_HEIGHT = 540;
const STRIP_HEIGHT = 56;
const FOOTER_HEIGHT = 52;
const PAD = 32;

const INK = '#111110';
const PAPER = '#faf8f3';

export interface MockPngOptions {
  /** The palette colours (hex + optional role) to colour the mock with. */
  colors: MockColorInput[];
  /** Selected template id - tags the filename. */
  templateId: string;
  /** Source slug or hex, used for the download filename. */
  name: string;
}

function v(vars: MockVars, key: keyof MockVars): string {
  return vars[key];
}

/** Rounded-rect path helper (older canvas impls lack `roundRect`). */
function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

/**
 * Draw a generic "three-card" composition tinted by the mock vars. We render a
 * single representative layout (the Cards hero) for every template id so the
 * downloaded image always reads as "this palette, applied" - the on-screen
 * preview remains the source of truth for per-template differences.
 */
function drawStage(ctx: CanvasRenderingContext2D, vars: MockVars, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = v(vars, '--mock-bg');
  rr(ctx, x, y, w, h, 12);
  ctx.fill();

  const inner = 28;
  const cardGap = 20;
  const cols = 3;
  const cardW = (w - inner * 2 - cardGap * (cols - 1)) / cols;
  const cardTop = y + inner + 36;
  const cardH = h - inner * 2 - 36 - 48;

  // Header label
  ctx.fillStyle = v(vars, '--mock-text');
  ctx.font = `700 22px ${SANS}`;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillText('Library', x + inner, y + inner);

  for (let i = 0; i < cols; i++) {
    const cx = x + inner + i * (cardW + cardGap);
    ctx.fillStyle = v(vars, '--mock-surface');
    rr(ctx, cx, cardTop, cardW, cardH, 10);
    ctx.fill();
    ctx.strokeStyle = v(vars, '--mock-border');
    ctx.lineWidth = 1;
    ctx.stroke();

    // Accent thumbnail
    ctx.fillStyle = v(vars, '--mock-accent');
    rr(ctx, cx + 14, cardTop + 14, cardW - 28, cardH * 0.42, 8);
    ctx.fill();

    // Title lines
    ctx.fillStyle = v(vars, '--mock-text');
    ctx.font = `600 14px ${SANS}`;
    ctx.fillText('Sunrise over', cx + 14, cardTop + cardH * 0.42 + 26);
    ctx.fillStyle = v(vars, '--mock-muted');
    ctx.font = `400 12px ${SANS}`;
    ctx.fillText('6 min read', cx + 14, cardTop + cardH * 0.42 + 46);
  }

  // CTA pill bottom-right
  const ctaW = 140;
  const ctaH = 36;
  const ctaX = x + w - inner - ctaW;
  const ctaY = y + h - inner - ctaH;
  ctx.fillStyle = v(vars, '--mock-accent');
  rr(ctx, ctaX, ctaY, ctaW, ctaH, 8);
  ctx.fill();
  ctx.fillStyle = v(vars, '--mock-on-accent');
  ctx.font = `600 13px ${SANS}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Browse all', ctaX + ctaW / 2, ctaY + ctaH / 2);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
}

export function mockToPngBlob({ colors }: MockPngOptions): Promise<Blob> {
  const vars = computeMockVars(colors);
  const dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
  const logicalHeight = PAD * 2 + STAGE_HEIGHT + STRIP_HEIGHT + 16 + FOOTER_HEIGHT;

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(WIDTH * dpr);
  canvas.height = Math.round(logicalHeight * dpr);
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.reject(new Error('Canvas 2D context unavailable'));
  ctx.scale(dpr, dpr);

  // Page background
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, WIDTH, logicalHeight);

  // Stage
  drawStage(ctx, vars, PAD, PAD, WIDTH - PAD * 2, STAGE_HEIGHT);

  // Palette strip (raw colours, inline order)
  const stripY = PAD + STAGE_HEIGHT + 16;
  const swW = (WIDTH - PAD * 2) / Math.max(1, colors.length);
  colors.forEach((c, i) => {
    ctx.fillStyle = c.hex;
    ctx.fillRect(PAD + i * swW, stripY, Math.ceil(swW), STRIP_HEIGHT);
  });

  // Footer wordmark
  const footerY = stripY + STRIP_HEIGHT + 16;
  ctx.fillStyle = INK;
  ctx.fillRect(0, footerY, WIDTH, FOOTER_HEIGHT);
  ctx.fillStyle = PAPER;
  ctx.font = `700 15px ${SANS}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
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

/** Build the mock PNG and trigger a browser download. */
export async function downloadMockPng(opts: MockPngOptions): Promise<void> {
  const blob = await mockToPngBlob(opts);
  const safeName = opts.name.replace(/^#/, '').replace(/[^a-z0-9-]+/gi, '-');
  const filename = `uishades-${safeName}-${opts.templateId}.png`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
