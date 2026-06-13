/**
 * Per-column flex-grow weights for the palette layout (preview band, header
 * row, and shade grid — all keyed to the same tray order so they stay aligned).
 *
 * The user's brand colors are the contiguous prefix before `boundary`; the
 * auto-seeded semantic block (Neutral/Success/Warning/Error) is the suffix from
 * `boundary` on. The user group collectively occupies **at least 50%** of the
 * container, and the seeded group shares the remainder — so a single user color
 * sitting next to four seeded roles still gets half the width, instead of the
 * 1/5 an equal split would give it. Within each group columns are equal-width.
 *
 * When the user group is already the majority, its proportional share (> 50%)
 * is kept rather than shrunk to the floor. When one group is absent (no seeded
 * block, or no user colors at all) every column is equal-width (grow = 1), so a
 * single-group palette is unaffected.
 *
 * Returned weights are meant for `flex-grow` with `flex-basis: 0`, where only
 * the ratio between columns matters.
 */
export function paletteColumnGrows(total: number, boundary: number): number[] {
  const userCount = boundary;
  const seededCount = total - boundary;
  // A split only makes sense when BOTH groups are present; otherwise equal.
  if (userCount <= 0 || seededCount <= 0) {
    return Array.from({ length: Math.max(total, 0) }, () => 1);
  }
  const userShare = Math.max(0.5, userCount / total);
  const seededShare = 1 - userShare;
  return Array.from({ length: total }, (_, i) =>
    i < boundary ? userShare / userCount : seededShare / seededCount,
  );
}
