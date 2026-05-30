import { describe, it, expect } from 'vitest';
import { hueBucket, HUE_BUCKETS, ACHROMATIC_CHROMA } from '../src/lib/color/hue';
import type { Hex } from '../src/lib/color/types';

describe('hueBucket', () => {
  it('returns null for achromatic colors (grays/black/white)', () => {
    expect(hueBucket('#000000' as Hex)).toBeNull();
    expect(hueBucket('#ffffff' as Hex)).toBeNull();
    expect(hueBucket('#808080' as Hex)).toBeNull();
    expect(hueBucket('#7f7f7f' as Hex)).toBeNull();
  });

  it('maps saturated primaries to a bucket in 0..11', () => {
    for (const hex of ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#00ffff', '#ff00ff'] as Hex[]) {
      const b = hueBucket(hex);
      expect(b).not.toBeNull();
      expect(b!).toBeGreaterThanOrEqual(0);
      expect(b!).toBeLessThan(HUE_BUCKETS);
    }
  });

  it('is stable: the same hex always maps to the same bucket', () => {
    expect(hueBucket('#4040ff' as Hex)).toBe(hueBucket('#4040ff' as Hex));
  });

  it('groups perceptually similar hues into the same bucket', () => {
    // Two near-identical reds should share a family.
    expect(hueBucket('#ff0000' as Hex)).toBe(hueBucket('#fa0505' as Hex));
  });

  it('distinguishes far-apart hues into different buckets', () => {
    expect(hueBucket('#ff0000' as Hex)).not.toBe(hueBucket('#0000ff' as Hex));
  });

  it('treats a barely-tinted near-gray (chroma < threshold) as achromatic', () => {
    // A near-neutral whose chroma sits under the achromatic cutoff returns null.
    expect(ACHROMATIC_CHROMA).toBeCloseTo(0.03, 5);
    expect(hueBucket('#7e7f80' as Hex)).toBeNull();
  });
});
