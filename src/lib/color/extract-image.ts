/**
 * Image → palette extraction for the Image Color Picker page.
 *
 * Two pure, SSR-safe primitives operate on a plain RGBA buffer (the shape of a
 * canvas `ImageData`), so they unit-test without a DOM:
 *
 *   - `extractSamplePoints` runs Modified Median Cut (the `quantize` library, the
 *     same algorithm color-thief wraps) over a strided sample of the pixels,
 *     ranks the resulting buckets by population (most dominant first), and for
 *     each bucket returns ONE real pixel as a *sample point*.
 *   - `sampleHexAt` reads the exact pixel at a normalized (0..1) coordinate.
 *
 * Model invariant (see CONTEXT.md → "Sample point"): a sample point's color is
 * always the actual pixel beneath its circle, never a synthesized bucket
 * average. So `extractSamplePoints` reports each bucket's *representative pixel*
 * (the sampled pixel closest to the bucket color) and uses that pixel's own
 * color as the swatch - which keeps it byte-identical to what `sampleHexAt`
 * returns at the same coordinate, so dragging a circle is perfectly consistent
 * with where extraction first dropped it.
 *
 * The DOM glue (File → downscaled canvas → ImageData) lives in
 * `ImagePalettePanel`, not here, so this module stays free of `document`.
 */
import quantize from 'quantize';
import type { Hex } from './types';

/** One palette color tied to a normalized location on the source image. */
export interface SamplePoint {
  hex: Hex;
  /** 0..1 across the image width. */
  x: number;
  /** 0..1 down the image height. */
  y: number;
}

/** The subset of canvas `ImageData` these functions need (so tests can fake it). */
export interface RGBAImage {
  data: Uint8ClampedArray | number[];
  width: number;
  height: number;
}

// Skip near-transparent pixels so a PNG's transparent margin never seeds a
// bucket (and so the representative pixel is always something the user can see).
const ALPHA_MIN = 125;

// Cap the number of pixels fed to quantize. The panel already downscales the
// image to <=1000px on the long edge, but a 1000x1000 image is still 1M pixels;
// median-cut over that is needlessly slow. Striding to ~MAX_SAMPLES keeps
// extraction snappy with no visible quality loss (color-thief defaults to a
// stride of 10 for the same reason).
const MAX_SAMPLES = 60_000;

const HEX2 = (n: number): string => n.toString(16).padStart(2, '0');

/** RGB triplet (0..255 each) → canonical lowercase `#rrggbb`. */
export function rgbToHex(r: number, g: number, b: number): Hex {
  return `#${HEX2(r & 255)}${HEX2(g & 255)}${HEX2(b & 255)}`;
}

/** Squared RGB distance - cheap nearest-bucket metric (no sqrt needed). */
function dist2(
  ar: number,
  ag: number,
  ab: number,
  br: number,
  bg: number,
  bb: number,
): number {
  const dr = ar - br;
  const dg = ag - bg;
  const db = ab - bb;
  return dr * dr + dg * dg + db * db;
}

/**
 * Read the exact pixel color at a normalized coordinate. Coordinates are
 * clamped into range, so an out-of-bounds drag still returns an edge pixel
 * rather than throwing. Used live while dragging a sample point or hovering the
 * loupe, and when dropping a new sample point.
 */
export function sampleHexAt(img: RGBAImage, xN: number, yN: number): Hex {
  const w = img.width;
  const h = img.height;
  const x = Math.min(w - 1, Math.max(0, Math.round(xN * (w - 1))));
  const y = Math.min(h - 1, Math.max(0, Math.round(yN * (h - 1))));
  const i = (y * w + x) * 4;
  return rgbToHex(img.data[i], img.data[i + 1], img.data[i + 2]);
}

/**
 * Extract up to `maxColors` dominant sample points from an image, ranked by
 * how much of the image each bucket covers (most dominant first). Returns fewer
 * than `maxColors` for simple images (a two-color logo yields ~2), and `[]` for
 * a fully transparent / empty buffer.
 */
export function extractSamplePoints(img: RGBAImage, maxColors = 8): SamplePoint[] {
  const { data, width, height } = img;
  const total = width * height;
  if (total === 0) return [];

  const stride = Math.max(1, Math.floor(total / MAX_SAMPLES));
  // Parallel arrays: pixels[k] is the RGB of the k-th sampled pixel, coords[k]
  // its (x, y). Kept in lockstep so a bucket's representative pixel carries its
  // location for the on-image circle.
  const pixels: [number, number, number][] = [];
  const coords: [number, number][] = [];
  for (let p = 0; p < total; p += stride) {
    const i = p * 4;
    if (data[i + 3] < ALPHA_MIN) continue;
    pixels.push([data[i], data[i + 1], data[i + 2]]);
    coords.push([p % width, (p / width) | 0]);
  }
  if (pixels.length === 0) return [];

  const dw = width - 1 || 1;
  const dh = height - 1 || 1;

  const want = Math.max(2, Math.min(maxColors, 8));
  const cmap = quantize(pixels, want);
  if (!cmap) {
    // quantize bails on degenerate input (e.g. a single unique color). Fall
    // back to the first opaque pixel so the page still yields one swatch.
    const [cx, cy] = coords[0];
    const [r, g, b] = pixels[0];
    return [{ hex: rgbToHex(r, g, b), x: cx / dw, y: cy / dh }];
  }

  const palette = cmap.palette();
  const n = palette.length;
  if (n === 0) return [];

  const counts = new Array<number>(n).fill(0);
  const bestDist = new Array<number>(n).fill(Infinity);
  const bestCoord = new Array<[number, number] | null>(n).fill(null);
  const bestRgb = new Array<[number, number, number] | null>(n).fill(null);

  // One pass: assign every sampled pixel to its nearest bucket (for population
  // counts) while tracking, per bucket, the single closest real pixel + its
  // location (the representative sample point).
  for (let k = 0; k < pixels.length; k++) {
    const [pr, pg, pb] = pixels[k];
    let bi = 0;
    let bd = Infinity;
    for (let j = 0; j < n; j++) {
      const pj = palette[j];
      const d = dist2(pr, pg, pb, pj[0], pj[1], pj[2]);
      if (d < bd) {
        bd = d;
        bi = j;
      }
    }
    counts[bi]++;
    if (bd < bestDist[bi]) {
      bestDist[bi] = bd;
      bestCoord[bi] = coords[k];
      bestRgb[bi] = pixels[k];
    }
  }

  // Rank populated buckets by dominance, then materialize sample points using
  // each bucket's representative *pixel* color (Model 1 invariant), deduping any
  // two buckets that resolve to the same exact pixel color.
  const order: number[] = [];
  for (let j = 0; j < n; j++) {
    if (counts[j] > 0 && bestCoord[j]) order.push(j);
  }
  order.sort((a, b) => counts[b] - counts[a]);

  const seen = new Set<string>();
  const points: SamplePoint[] = [];
  for (const j of order) {
    const [r, g, b] = bestRgb[j]!;
    const hex = rgbToHex(r, g, b);
    if (seen.has(hex)) continue;
    seen.add(hex);
    const [cx, cy] = bestCoord[j]!;
    points.push({ hex, x: cx / dw, y: cy / dh });
    if (points.length >= maxColors) break;
  }
  return points;
}
