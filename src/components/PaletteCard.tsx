import type { ReactNode } from 'react';
import type { PaletteSummary } from '../lib/auth/types';
import UpvoteButton from './UpvoteButton';

/**
 * PaletteCard - presentational palette tile, fed entirely by a `PaletteSummary`.
 *
 * Shared by the private dashboard (`PalettesDashboard`) and the public `/explore`
 * grid. It renders a horizontal band of swatches (inline `backgroundColor`,
 * theme-toggle-safe) and the palette name as an `.eyebrow`.
 *
 * The vote control is OPTIONAL, toggled by a prop so the owner dashboard can
 * hide it (`showVote={false}`) while the explore grid shows it:
 *
 * - `showVote` (default true) fills the upvote slot with `<UpvoteButton/>`,
 *   driven by the summary's `voteCount`/`votedByMe`/`id`. An explicit `upvote`
 *   node overrides it (escape hatch).
 *
 * `action` is a trailing slot used by the dashboard for the `…` overflow menu.
 */

interface PaletteCardProps {
  palette: PaletteSummary;
  /**
   * Show the upvote control (default true). The dashboard passes false.
   */
  showVote?: boolean;
  /**
   * Explicit upvote node - overrides the built-in `UpvoteButton`. Rarely needed;
   * the card wires its own from the summary when `showVote` is true.
   */
  upvote?: ReactNode;
  /** Optional trailing slot - used by the dashboard for the `…` overflow menu. */
  action?: ReactNode;
  /** When set, the whole card name links here (e.g. the editor or `/p/[slug]`). */
  href?: string;
}

export default function PaletteCard({
  palette,
  showVote = true,
  upvote,
  action,
  href,
}: PaletteCardProps) {
  const colors = palette.colors.length > 0 ? palette.colors : ['#f5f5f5'];

  const name = href ? (
    <a
      href={href}
      className="eyebrow truncate text-ink transition-colors duration-150 ease-out hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 motion-reduce:transition-none"
    >
      {palette.name}
    </a>
  ) : (
    <span className="eyebrow truncate text-ink">{palette.name}</span>
  );

  const voteNode =
    upvote ??
    (showVote ? (
      <UpvoteButton
        paletteId={palette.id}
        voteCount={palette.voteCount}
        votedByMe={palette.votedByMe}
      />
    ) : null);

  return (
    <article className="flex flex-col gap-3 pt-5">
      {/* Swatch band - inline fills so the colors survive the theme toggle. */}
      <div className="flex h-16 w-full overflow-hidden border border-hairline">
        {colors.map((hex, i) => (
          <span
            key={`${hex}-${i}`}
            aria-hidden="true"
            className="h-full flex-1"
            style={{ backgroundColor: hex }}
          />
        ))}
      </div>

      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">{name}</div>
        {voteNode}
        {action ?? null}
      </div>
    </article>
  );
}
