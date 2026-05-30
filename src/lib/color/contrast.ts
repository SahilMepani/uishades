/**
 * WCAG 2.1 contrast helpers.
 *
 * Uses culori's `wcagContrast`, which implements the standard relative
 * luminance formula on linearized sRGB channels (the same math used in
 * the W3C spec). We re-export it under a typed wrapper plus a level
 * classifier that maps a ratio to AAA / AA / AA-Lg / fail.
 */

import { wcagContrast } from 'culori';
import type { Hex } from './types';

export type WcagLevel = 'AAA' | 'AA' | 'AA-Lg' | 'fail';

/**
 * Contrast ratio between two colors. Output is in the canonical 1..21 range
 * (1 = identical luminance, 21 = pure black vs pure white).
 */
export function contrastRatio(a: Hex, b: Hex): number {
  return wcagContrast(a, b);
}

/**
 * WCAG level for a given ratio.
 *
 * When `isLargeText` is true the thresholds drop one tier (large text needs
 * only 3:1 for AA, 4.5:1 for AAA). When false (default, normal-size text)
 * a ratio in [3, 4.5) is reported as `AA-Lg` — i.e., would pass AA only
 * if rendered as large text — to surface the limitation in the UI.
 */
export function wcagLevel(ratio: number, isLargeText = false): WcagLevel {
  if (isLargeText) {
    if (ratio >= 4.5) return 'AAA';
    if (ratio >= 3) return 'AA';
    return 'fail';
  }
  if (ratio >= 7) return 'AAA';
  if (ratio >= 4.5) return 'AA';
  if (ratio >= 3) return 'AA-Lg';
  return 'fail';
}
