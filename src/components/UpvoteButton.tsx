import { useCallback, useEffect, useRef, useState } from 'react';
import SignInModal from './SignInModal';

/**
 * UpvoteButton - the heart "like" + count control on every PaletteCard.
 *
 * A like IS the vote (one per user, toggled); the heart is just the affordance.
 * Optimistic toggle: clicking flips `voted`/`count` immediately, then POSTs
 * (like) or DELETEs (unlike) `/api/palettes/[id]/vote`. The server returns the
 * authoritative `{ voteCount, votedByMe }`, which we reconcile onto local state;
 * on network/other failure we roll back to the pre-click values.
 *
 * Liking REQUIRES sign-in. A signed-out click (or a 401 from the API) opens the
 * same sign-in modal HeaderAuth uses - `AuthMenu` rendered in a portal dialog
 * with the magic-link / OAuth controls - instead of erroring. This is itself a
 * signup nudge (per the plan).
 *
 * Accessible: a real <button> with `aria-pressed` reflecting the voted state.
 */

interface UpvoteButtonProps {
  paletteId: string;
  voteCount: number;
  votedByMe: boolean;
}

interface VoteResponse {
  voteCount: number;
  votedByMe: boolean;
}

export default function UpvoteButton({ paletteId, voteCount, votedByMe }: UpvoteButtonProps) {
  const [count, setCount] = useState(voteCount);
  const [voted, setVoted] = useState(votedByMe);
  const [busy, setBusy] = useState(false);
  const [signInOpen, setSignInOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  // Keep in sync if the parent re-feeds props (e.g. a re-query in ExploreGrid).
  useEffect(() => {
    setCount(voteCount);
  }, [voteCount]);
  useEffect(() => {
    setVoted(votedByMe);
  }, [votedByMe]);

  const handleClick = useCallback(async () => {
    if (busy) return;
    const wasVoted = voted;
    const wasCount = count;
    // Optimistic flip.
    const nextVoted = !wasVoted;
    setVoted(nextVoted);
    setCount(wasCount + (nextVoted ? 1 : -1));
    setBusy(true);
    try {
      const res = await fetch(`/api/palettes/${paletteId}/vote`, {
        method: nextVoted ? 'POST' : 'DELETE',
        credentials: 'same-origin',
      });
      if (res.status === 401) {
        // Signed out - revert and open the sign-in modal.
        setVoted(wasVoted);
        setCount(wasCount);
        setSignInOpen(true);
        return;
      }
      if (!res.ok) throw new Error();
      const data = (await res.json()) as VoteResponse;
      setVoted(data.votedByMe);
      setCount(data.voteCount);
    } catch {
      setVoted(wasVoted);
      setCount(wasCount);
    } finally {
      setBusy(false);
    }
  }, [busy, voted, count, paletteId]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={handleClick}
        aria-pressed={voted}
        aria-label={voted ? `Unlike (${count})` : `Like (${count})`}
        title={voted ? 'Unlike' : 'Like'}
        className={
          'inline-flex shrink-0 items-center gap-1 border px-2 py-1 font-mono text-[12px] tabular-nums transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 motion-reduce:transition-none ' +
          (voted
            ? 'border-accent/40 bg-accent/10 text-accent'
            : 'border-ink/20 text-ink-2 hover:border-ink/40 hover:text-ink')
        }
      >
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className="h-3.5 w-3.5"
          fill={voted ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 1 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
        </svg>
        <span>{count}</span>
      </button>

      {signInOpen && (
        <SignInModal
          onClose={() => setSignInOpen(false)}
          triggerRef={triggerRef}
          kicker="Like"
          heading="Sign in to like"
        />
      )}
    </>
  );
}
