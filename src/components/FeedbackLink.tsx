import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { MeResponse } from '../lib/auth/types';

/**
 * FeedbackLink - the footer's "Feedback" control.
 *
 * Self-contained `client:load` island rendered inside the footer nav (in both
 * `ColorToolLayout` and the named-color pages). The trigger is a <button>
 * styled to match its sibling footer <a> links; clicking it opens a modal that
 * posts to `/api/feedback`. The modal reuses the same portal + focus-trap +
 * Escape-to-close pattern as the header's account modal (`HeaderAuth`), and
 * shows its outcome inline (this island has no toast system of its own).
 */

type Status = { kind: 'ok' | 'error'; text: string } | null;

export default function FeedbackLink() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="uppercase text-ink transition-colors duration-150 ease-out hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 motion-reduce:transition-none"
      >
        Feedback
      </button>

      {open && <FeedbackModal onClose={() => setOpen(false)} triggerRef={triggerRef} />}
    </>
  );
}

function FeedbackModal({
  onClose,
  triggerRef,
}: {
  onClose: () => void;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [status, setStatus] = useState<Status>(null);
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

  // Prefill the email for a signed-in visitor (still editable). Fetched on open
  // rather than at page load so an anonymous visitor pays nothing for it.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/me', { credentials: 'same-origin' })
      .then((r): Promise<MeResponse> =>
        r.ok ? r.json() : Promise.resolve({ user: null, presets: [], plan: 'free' }),
      )
      .then((data) => {
        if (!cancelled && data.user?.email) {
          setEmail((prev) => prev || data.user!.email);
          if (data.user?.name) setName((prev) => prev || data.user!.name!);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Escape-to-close - kept separate from focus/scroll management so a status
  // re-render never disturbs focus.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') requestClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [requestClose]);

  // Body-scroll lock + focus management - strictly mount/unmount (triggerRef is
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

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const trimmedName = name.trim();
      const trimmedEmail = email.trim();
      const trimmedMessage = message.trim();
      if (!trimmedName || !trimmedEmail || !trimmedMessage || submitting) return;

      setSubmitting(true);
      setStatus(null);
      try {
        const res = await fetch('/api/feedback', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({
            name: trimmedName,
            email: trimmedEmail,
            message: trimmedMessage,
          }),
        });
        if (res.status === 429) {
          throw new Error('Too many messages - please try again later.');
        }
        if (!res.ok) {
          throw new Error("Couldn't send your feedback. Please try again.");
        }
        setSent(true);
      } catch (err) {
        setStatus({
          kind: 'error',
          text: err instanceof Error ? err.message : 'Something went wrong.',
        });
      } finally {
        setSubmitting(false);
      }
    },
    [name, email, message, submitting],
  );

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
        aria-label="Send feedback"
        tabIndex={-1}
        className={
          'relative z-10 w-full max-w-sm border border-hairline bg-paper p-6 shadow-[0_24px_64px_rgba(17,17,16,0.28)] transition-all duration-200 ease-out focus:outline-none motion-reduce:transition-none ' +
          (show ? 'translate-y-0 opacity-100' : 'translate-y-1 opacity-0')
        }
      >
        <button
          type="button"
          onClick={requestClose}
          aria-label="Close feedback dialog"
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

        {sent ? (
          <div className="flex flex-col gap-3">
            <span className="eyebrow">Feedback</span>
            <p className="font-mono text-sm leading-relaxed text-ink">
              Thanks for the feedback - we appreciate it!
            </p>
            <button
              type="button"
              onClick={requestClose}
              className="self-start border border-ink/20 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.16em] text-ink transition-colors duration-200 ease-out hover:border-ink/40 hover:bg-paper-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
            >
              Close
            </button>
          </div>
        ) : (
          <>
            <div className="mb-3 flex flex-col gap-1">
              <span className="eyebrow">Feedback</span>
              <p className="font-mono text-[13px] leading-relaxed text-mute">
                Found a bug or have an idea? Tell us - it goes straight to the maker.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-2">
              <input
                type="text"
                required
                maxLength={100}
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                placeholder="Your name"
                aria-label="Your name"
                className="w-full border border-ink/20 bg-paper-2 px-3 py-2 font-mono text-sm text-ink placeholder:text-mute focus:outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/30"
              />
              <input
                type="email"
                required
                maxLength={254}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                spellCheck={false}
                placeholder="you@example.com"
                aria-label="Your email"
                className="w-full border border-ink/20 bg-paper-2 px-3 py-2 font-mono text-sm text-ink placeholder:text-mute focus:outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/30"
              />
              <textarea
                required
                maxLength={5000}
                rows={4}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="What's on your mind?"
                aria-label="Your message"
                className="w-full resize-y border border-ink/20 bg-paper-2 px-3 py-2 font-mono text-sm text-ink placeholder:text-mute focus:outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/30"
              />
              <button
                type="submit"
                disabled={submitting}
                className="bg-ink px-3 py-2 font-mono text-[11px] uppercase tracking-[0.16em] text-paper transition-colors duration-200 ease-out hover:bg-ink/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 disabled:cursor-default disabled:opacity-60"
              >
                {submitting ? 'Sending…' : 'Send feedback'}
              </button>
            </form>

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
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
