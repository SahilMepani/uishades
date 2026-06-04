import { describe, it, expect } from 'vitest';
import {
  extractSamplePoints,
  sampleHexAt,
  rgbToHex,
  type RGBAImage,
} from '../src/lib/color/extract-image';

/**
 * Build an RGBA buffer (canvas ImageData shape) from a w×h grid of [r,g,b,a]
 * pixels produced by `fill(x, y)`. Alpha defaults to opaque.
 */
function makeImage(
  width: number,
  height: number,
  fill: (x: number, y: number) => [number, number, number, number?],
): RGBAImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b, a = 255] = fill(x, y);
      const i = (y * width + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = a;
    }
  }
  return { data, width, height };
}

const RED: [number, number, number] = [255, 0, 0];
const BLUE: [number, number, number] = [0, 0, 255];

describe('rgbToHex', () => {
  it('formats canonical lowercase #rrggbb with zero-padding', () => {
    expect(rgbToHex(0, 0, 0)).toBe('#000000');
    expect(rgbToHex(255, 255, 255)).toBe('#ffffff');
    expect(rgbToHex(64, 64, 255)).toBe('#4040ff');
    expect(rgbToHex(5, 0, 9)).toBe('#050009');
  });
});

describe('sampleHexAt', () => {
  const img = makeImage(4, 4, (x) => (x < 2 ? RED : BLUE));

  it('reads the exact pixel under a normalized coordinate', () => {
    expect(sampleHexAt(img, 0, 0)).toBe('#ff0000');
    expect(sampleHexAt(img, 1, 0)).toBe('#0000ff');
  });

  it('clamps out-of-range coordinates to the nearest edge pixel', () => {
    expect(sampleHexAt(img, -5, -5)).toBe('#ff0000');
    expect(sampleHexAt(img, 9, 9)).toBe('#0000ff');
  });
});

describe('extractSamplePoints', () => {
  it('returns the two dominant colors of a half-red/half-blue image, each located in its half', () => {
    const img = makeImage(4, 4, (x) => (x < 2 ? RED : BLUE));
    const points = extractSamplePoints(img, 8);

    const hexes = points.map((p) => p.hex).sort();
    expect(hexes).toEqual(['#0000ff', '#ff0000']);

    const red = points.find((p) => p.hex === '#ff0000')!;
    const blue = points.find((p) => p.hex === '#0000ff')!;
    // The representative pixel for red must come from the left half, blue the right.
    expect(red.x).toBeLessThan(0.5);
    expect(blue.x).toBeGreaterThan(0.5);
    // Normalized coordinates stay in range.
    for (const p of points) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(1);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(1);
    }
  });

  it('every reported swatch is a real pixel of the image (Model 1 invariant)', () => {
    const img = makeImage(8, 8, (x, y) =>
      (x + y) % 2 === 0 ? [10, 200, 30] : [200, 20, 180],
    );
    const points = extractSamplePoints(img, 8);
    for (const p of points) {
      expect(sampleHexAt(img, p.x, p.y)).toBe(p.hex);
    }
  });

  it('honors the maxColors cap', () => {
    const img = makeImage(6, 1, (x) => {
      const palette: [number, number, number][] = [
        [255, 0, 0],
        [0, 255, 0],
        [0, 0, 255],
        [255, 255, 0],
        [0, 255, 255],
        [255, 0, 255],
      ];
      return palette[x];
    });
    expect(extractSamplePoints(img, 3).length).toBeLessThanOrEqual(3);
    expect(extractSamplePoints(img, 1).length).toBe(1);
  });

  it('skips near-transparent pixels and returns [] for a fully transparent image', () => {
    const transparent = makeImage(4, 4, () => [123, 45, 67, 0]);
    expect(extractSamplePoints(transparent, 8)).toEqual([]);
  });

  it('ignores a transparent margin when choosing colors', () => {
    // Opaque red square in the middle, transparent elsewhere.
    const img = makeImage(6, 6, (x, y) => {
      const inside = x >= 2 && x <= 3 && y >= 2 && y <= 3;
      return inside ? [255, 0, 0, 255] : [0, 0, 0, 0];
    });
    const points = extractSamplePoints(img, 8);
    expect(points.length).toBeGreaterThanOrEqual(1);
    expect(points.every((p) => p.hex === '#ff0000')).toBe(true);
  });

  it('returns [] for an empty buffer', () => {
    expect(extractSamplePoints({ data: new Uint8ClampedArray(0), width: 0, height: 0 })).toEqual([]);
  });
});
