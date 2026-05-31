/**
 * OG card "shade strip" index selection - pure, so it's unit-testable without
 * dragging the Satori / `workers-og` renderer into the test runtime.
 *
 * Picks five representative indices into a `count`-length OKLCH ramp around the
 * input's `ix` (= `ramp.inputIndex`): two lighter, the input itself, two darker.
 *
 * Every returned index is clamped to the valid range [0, count - 1]. The upper
 * bound is `count - 1` (NOT a hardcoded literal): for a dark input `ix` near the
 * end of the ramp, `ceil(ix + (21 - ix) * 0.75)` can reach `count`, which would
 * index one past the last shade and crash the renderer. Clamping to `count - 1`
 * is the fix - matching the `Math.min(ramp.shades.length - 1, …)` pattern the
 * neighbor walk in `api/[hex].json.ts` already uses.
 */
export function ogStripIndices(ix: number, count: number): number[] {
  const max = count - 1;
  return [
    Math.max(1, Math.floor(ix * 0.25)),
    Math.max(1, Math.floor(ix * 0.65)),
    ix,
    Math.min(max, Math.ceil(ix + (21 - ix) * 0.35)),
    Math.min(max, Math.ceil(ix + (21 - ix) * 0.75)),
  ];
}
