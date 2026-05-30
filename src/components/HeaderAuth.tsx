import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import AuthMenu from './AuthMenu';
import type { MeResponse } from '../lib/auth/types';

/**
 * HeaderAuth — the header's account control.
 *
 * Self-contained `client:load` island that lives in the header bar (before the
 * theme toggle), outside the ShadeTool React tree. It owns its own view of the
 * session: it fetches the credentialed `/api/me` on mount — never server-
 * rendered, since `/[hex]` HTML is edge-cached for 30 days and per-user state
 * would leak across visitors (same reasoning as ShadeTool's account block).
 *
 * Signed out: a "Sign in" button that opens a modal popup with the same
 * Google / GitHub / magic-link controls used in the tool's left rail (the
 * `AuthMenu` presentational component is reused verbatim). Signed in: a compact
 * avatar button that opens the same modal showing identity + sign out.
 *
 * Magic-link / OAuth outcome toasts (the `?signin=` callback param) are handled
 * by ShadeTool, which is always present alongside this island, so they're not
 * duplicated here — feedback for the magic-link request is shown inline.
 */

type AuthUser = MeResponse['user'];

export default function HeaderAuth() {
  const [user, setUser] = useState<AuthUser>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/me', { credentials: 'same-origin' })
      .then((r) => (r.ok ? (r.json() as Promise<MeResponse>) : { user: null, presets: [] }))
      .then((data) => {
        if (!cancelled) setUser(data.user);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleRequestMagicLink = useCallback(async (email: string): Promise<void> => {
    try {
      const res = await fetch('/api/auth/magic', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ email }),
      });
      if (res.status === 429) throw new Error('Too many requests — try again later.');
      if (!res.ok) throw new Error('Please enter a valid email.');
      return;
    } catch (err) {
      // Re-throw so the modal can surface the message inline.
      throw err instanceof Error ? err : new Error("Couldn't send the link. Please try again.");
    }
  }, []);

  const handleLogout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
    } catch {
      /* clear local state regardless */
    }
    setUser(null);
    setOpen(false);
  }, []);

  const initial = (user?.name || user?.email || '?').trim().charAt(0).toUpperCase();

  return (
    <>
      {user ? (
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-label="Account"
          className="inline-flex items-center gap-1.5 uppercase text-ink transition-colors duration-150 ease-out hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 motion-reduce:transition-none"
        >
          {user.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt=""
              width={20}
              height={20}
              className="h-5 w-5 rounded-full ring-1 ring-ink/10"
            />
          ) : (
            <span
              aria-hidden="true"
              className="flex h-5 w-5 items-center justify-center rounded-full bg-ink text-[10px] text-paper"
            >
              {initial}
            </span>
          )}
          <span>Account</span>
        </button>
      ) : (
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          disabled={loading}
          className="inline-flex items-center uppercase text-ink transition-colors duration-150 ease-out hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 motion-reduce:transition-none disabled:opacity-60"
        >
          Sign in
        </button>
      )}

      {open && (
        <AuthModal
          user={user}
          loading={loading}
          onRequestMagicLink={handleRequestMagicLink}
          onLogout={handleLogout}
          onClose={() => setOpen(false)}
          triggerRef={triggerRef}
        />
      )}
    </>
  );
}

function AuthModal({
  user,
  loading,
  onRequestMagicLink,
  onLogout,
  onClose,
  triggerRef,
}: {
  user: AuthUser;
  loading: boolean;
  onRequestMagicLink: (email: string) => Promise<void>;
  onLogout: () => void;
  onClose: () => void;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  // Drives the enter/exit fade. Starts false so the first paint is transparent,
  // then flips true on the next frame; `requestClose` flips it back and defers
  // the real unmount until the transition has run.
  const [show, setShow] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setShow(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const requestClose = useCallback(() => {
    setShow(false);
    window.setTimeout(onClose, 200);
  }, [onClose]);

  // Wrap the request so a sent link / error is surfaced inline in the popup
  // (this island has no toast system of its own).
  const requestMagicLink = useCallback(
    async (email: string) => {
      setStatus(null);
      try {
        await onRequestMagicLink(email);
        setStatus({ kind: 'ok', text: 'Check your inbox for a sign-in link.' });
      } catch (err) {
        setStatus({
          kind: 'error',
          text: err instanceof Error ? err.message : 'Something went wrong.',
        });
      }
    },
    [onRequestMagicLink],
  );

  // Escape-to-close — kept separate from focus/scroll management so a status
  // re-render never disturbs focus.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') requestClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [requestClose]);

  // Body-scroll lock + focus management — strictly mount/unmount (triggerRef is
  // stable). Must not depend on changing props/state or a re-render would eject
  // focus out of the open dialog.
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
        aria-label="Account"
        tabIndex={-1}
        className={
          'relative z-10 w-full max-w-sm border border-hairline bg-paper p-6 shadow-[0_24px_64px_rgba(17,17,16,0.28)] transition-all duration-200 ease-out focus:outline-none motion-reduce:transition-none ' +
          (show ? 'translate-y-0 opacity-100' : 'translate-y-1 opacity-0')
        }
      >
        <button
          type="button"
          onClick={requestClose}
          aria-label="Close account dialog"
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

        <AuthMenu
          user={user}
          loading={loading}
          onRequestMagicLink={requestMagicLink}
          onLogout={onLogout}
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
