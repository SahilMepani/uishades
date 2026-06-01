import { describe, it, expect } from 'vitest';
import { nearestNamedSlug } from '../src/lib/data/nearest-named';

describe('nearestNamedSlug', () => {
  it('returns the entry\'s own slug for an exact hex match', () => {
    expect(nearestNamedSlug('#4169e1')).toBe('royalblue');
  });

  it('returns the nearest slug for a hex a hair off an entry', () => {
    expect(nearestNamedSlug('#4169e2')).toBe('royalblue');
  });

  it('maps pure black to black', () => {
    expect(nearestNamedSlug('#000000')).toBe('black');
  });

  it('maps pure white to white', () => {
    expect(nearestNamedSlug('#ffffff')).toBe('white');
  });

  it('maps a near-mid gray to gray', () => {
    expect(nearestNamedSlug('#7f7f7f')).toBe('gray');
  });
});
