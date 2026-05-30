/**
 * Tailwind-style 11-stop anchor table.
 *
 * Lightness (OKLCH L, 0..1) and chroma multiplier per stop. The chroma
 * multiplier expresses how saturated the stop should be relative to the
 * input's chroma when the input is pinned at stop 500. Values calibrated
 * against the Tailwind v4 palette median; they are starting points that
 * may be fine-tuned visually before launch (see plan).
 */

export const STOPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;
export type Stop = (typeof STOPS)[number];

export const ANCHORS: Record<Stop, { l: number; cMul: number }> = {
  50: { l: 0.985, cMul: 0.18 },
  100: { l: 0.967, cMul: 0.30 },
  200: { l: 0.922, cMul: 0.55 },
  300: { l: 0.870, cMul: 0.80 },
  400: { l: 0.770, cMul: 0.95 },
  500: { l: 0.637, cMul: 1.00 },
  600: { l: 0.555, cMul: 1.00 },
  700: { l: 0.482, cMul: 0.95 },
  800: { l: 0.385, cMul: 0.80 },
  900: { l: 0.298, cMul: 0.65 },
  950: { l: 0.205, cMul: 0.45 },
};
