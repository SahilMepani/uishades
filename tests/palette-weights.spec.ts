import { describe, it, expect } from 'vitest';
import { paletteColumnGrows } from '../src/lib/palette-weights';

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const groupShare = (grows: number[], boundary: number) => ({
  user: sum(grows.slice(0, boundary)) / sum(grows),
  seeded: sum(grows.slice(boundary)) / sum(grows),
});

describe('paletteColumnGrows', () => {
  it('gives a single user color 50% against a seeded block', () => {
    // 1 user + 4 seeded.
    const grows = paletteColumnGrows(5, 1);
    const { user, seeded } = groupShare(grows, 1);
    expect(user).toBeCloseTo(0.5, 10);
    expect(seeded).toBeCloseTo(0.5, 10);
    // The 4 seeded columns split their half equally.
    expect(grows[1]).toBeCloseTo(grows[4], 10);
  });

  it('keeps the user group at exactly the 50% floor when it is the minority', () => {
    // 2 user + 4 seeded → equal split would give user 1/3; floor lifts to 1/2.
    const grows = paletteColumnGrows(6, 2);
    const { user } = groupShare(grows, 2);
    expect(user).toBeCloseTo(0.5, 10);
    // Equal within each group.
    expect(grows[0]).toBeCloseTo(grows[1], 10);
    expect(grows[2]).toBeCloseTo(grows[5], 10);
  });

  it('keeps the proportional share when the user group is the majority', () => {
    // 3 user + 1 seeded → 75% naturally exceeds the 50% floor, so it is kept.
    const grows = paletteColumnGrows(4, 3);
    const { user } = groupShare(grows, 3);
    expect(user).toBeCloseTo(0.75, 10);
    // Majority case collapses to equal-width columns.
    expect(new Set(grows).size).toBe(1);
  });

  it('is equal-width when there is no seeded block', () => {
    expect(paletteColumnGrows(3, 3)).toEqual([1, 1, 1]);
  });

  it('is equal-width when there are no user colors', () => {
    expect(paletteColumnGrows(3, 0)).toEqual([1, 1, 1]);
  });

  it('returns one weight per column', () => {
    expect(paletteColumnGrows(5, 1)).toHaveLength(5);
    expect(paletteColumnGrows(1, 1)).toHaveLength(1);
    expect(paletteColumnGrows(0, 0)).toHaveLength(0);
  });
});
