import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import AuthMenu from './AuthMenu';

/**
 * UpvoteButton — the heart "like" + count control on every PaletteCard.
 *
 * A like IS the vote (one per user, toggled); the heart is just the affordance.
 * Optimistic toggle: clicking flips `voted`/`count` immediately, then POSTs
 * (like) or DELETEs (unlike) `/api/palettes/[id]/vote`. The server returns the
 * authoritative `{ voteCount, votedByMe }`, which we reconcile onto local state;
 * on network/other failure we roll back to the pre-click values.
 *
 * Liking REQUIRES sign-in. A signed-out click (or a 401 from the API) opens the
 * same sign-in modal HeaderAuth uses — `AuthMenu` rendered in a portal dialog
 * with the magic-link / OAuth controls — instead of erroring. This is itself a
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
        // Signed out — revert and open the sign-in modal.
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
        <SignInModal onClose={() => setSignInOpen(false)} triggerRef={triggerRef} />
      )}
    </>
  );
}

/**
 * SignInModal — the same modal HeaderAuth presents, rendered on demand when a
 * signed-out user tries to vote. Reuses `AuthMenu` verbatim (Google/GitHub +
 * magic-link), wired to the same `/api/auth/magic` request. Portal + backdrop +
 * Escape/click-out close + focus restore mirror HeaderAuth's primitives.
 */
function SignInModal({
  onClose,
  triggerRef,
}: {
  onClose: () => void;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const [show, setShow] = useState(false);
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => {
    const id = requestAnimationFrame(() => setShow(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const requestClose = useCallback(() => {
    setShow(false);
    window.setTimeout(onClose, 200);
  }, [onClose]);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') requestClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [requestClose]);

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const trigger = triggerRef.current;
    dialogRef.current?.focus();
    return () => {
      document.body.style.overflow = prevOverflow;
      trigger?.focus();
    };
  }, [triggerRef]);

  const requestMagicLink = useCallback(async (email: string) => {
    setStatus(null);
    try {
      const res = await fetch('/api/auth/magic', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ email }),
      });
      if (res.status === 429) throw new Error('Too many requests — try again later.');
      if (!res.ok) throw new Error('Please enter a valid email.');
      setStatus({ kind: 'ok', text: 'Check your inbox for a sign-in link.' });
    } catch (err) {
      setStatus({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Something went wrong.',
      });
    }
  }, []);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[12vh]">
      <div
        aria-hidden="true"
        onClick={requestClose}
        className={
          'absolute inset-0 bg-black/40 backdrop-blur-[1px] transition-opacity duration-200 ease-out motion-reduce:transition-none ' +
          (show ? 'opacity-100' : 'opacity-0')
        }
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Sign in to like"
        tabIndex={-1}
        className={
          'relative z-10 w-full max-w-sm border border-hairline bg-paper p-6 shadow-[0_24px_64px_rgba(17,17,16,0.28)] transition-all duration-200 ease-out focus:outline-none motion-reduce:transition-none ' +
          (show ? 'translate-y-0 opacity-100' : 'translate-y-1 opacity-0')
        }
      >
        <button
          type="button"
          onClick={requestClose}
          aria-label="Close sign-in dialog"
          className="absolute right-3 top-3 inline-flex h-7 w-7 items-center justify-center text-mute transition-colors duration-150 ease-out hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
        >
          <svg viewBox="0 0 16 16" aria-hidden="true" className="h-4 w-4">
            <path
              d="M3 3l10 10M13 3L3 13"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>

        <div className="mb-4 flex flex-col gap-1">
          <span className="kicker">Like</span>
          <h2 className="display text-xl">Sign in to like</h2>
        </div>

        <AuthMenu
          user={null}
          loading={false}
          onRequestMagicLink={requestMagicLink}
          onLogout={() => {}}
        />

        {status && (
          <p
            role="status"
            className={
              'mt-3 font-mono text-[11px] leading-relaxed ' +
              (status.kind === 'ok' ? 'text-ink' : 'text-accent')
            }
          >
            {status.text}
          </p>
        )}
      </div>
    </div>,
    document.body,
  );
}
