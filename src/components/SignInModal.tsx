import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import AuthMenu from './AuthMenu';

/**
 * SignInModal - the same modal HeaderAuth presents, rendered on demand when a
 * signed-out user tries to do something that requires an account (liking a
 * palette, saving a palette). Reuses `AuthMenu` verbatim (Google/GitHub +
 * magic-link), wired to the same `/api/auth/magic` request. Portal + backdrop +
 * Escape/click-out close + focus restore mirror HeaderAuth's primitives.
 *
 * `kicker`/`heading` let each caller name the action that triggered the prompt
 * (e.g. "Like" / "Sign in to like"). Omit both to drop the header block entirely
 * and let `AuthMenu`'s own "Account" label carry the prompt; pass `ariaLabel` so
 * the dialog still has an accessible name in that case.
 */
export default function SignInModal({
  onClose,
  triggerRef,
  kicker,
  heading,
  ariaLabel,
}: {
  onClose: () => void;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  kicker?: string;
  heading?: string;
  ariaLabel?: string;
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
      if (res.status === 429) throw new Error('Too many requests - try again later.');
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
        aria-label={ariaLabel ?? heading ?? 'Sign in'}
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

        {(kicker || heading) && (
          <div className="mb-6 flex flex-col gap-1">
            {kicker && <span className="kicker">{kicker}</span>}
            {heading && <h2 className="display text-xl">{heading}</h2>}
          </div>
        )}

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
