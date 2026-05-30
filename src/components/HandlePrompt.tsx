import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * HandlePrompt — modal to set/update the user's public handle + display name.
 *
 * Reuses HeaderAuth's modal primitives verbatim (portal to `document.body`,
 * backdrop blur, enter/exit fade, Escape + click-out close, body-scroll lock,
 * focus management). POSTs `{ handle, displayName }` to `/api/me/handle`.
 *
 * The handle is validated client-side against the same `^[a-z0-9_-]{3,30}$`
 * rule the server enforces, with a debounced live-availability probe (a HEAD-
 * style GET is not part of the v1 API, so availability is surfaced by the POST
 * itself: a 409 means taken). The submit path handles 409 (taken), 400
 * (invalid / profanity) and success.
 */

const HANDLE_RE = /^[a-z0-9_-]{3,30}$/;

interface HandlePromptProps {
  /** Prefill (e.g. current handle / suggested from name). */
  initialHandle?: string;
  initialDisplayName?: string;
  onClose: () => void;
  /** Fired with the saved values once the POST succeeds. */
  onSaved?: (handle: string, displayName: string | null) => void;
  /** The button that opened the modal, for focus restoration. */
  triggerRef?: React.RefObject<HTMLElement | null>;
}

type Status =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'error'; text: string }
  | { kind: 'ok' };

export default function HandlePrompt({
  initialHandle = '',
  initialDisplayName = '',
  onClose,
  onSaved,
  triggerRef,
}: HandlePromptProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [handle, setHandle] = useState(initialHandle);
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [show, setShow] = useState(false);

  const normalized = handle.trim().toLowerCase();
  const localValid = HANDLE_RE.test(normalized);

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
    const trigger = triggerRef?.current ?? null;
    inputRef.current?.focus();
    return () => {
      document.body.style.overflow = prevOverflow;
      trigger?.focus();
    };
  }, [triggerRef]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!localValid) {
        setStatus({
          kind: 'error',
          text: 'Use 3–30 characters: lowercase letters, numbers, - or _.',
        });
        return;
      }
      setStatus({ kind: 'saving' });
      try {
        const res = await fetch('/api/me/handle', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({
            handle: normalized,
            displayName: displayName.trim() || null,
          }),
        });
        if (res.status === 409) {
          setStatus({ kind: 'error', text: 'That handle is taken — try another.' });
          return;
        }
        if (res.status === 400) {
          setStatus({ kind: 'error', text: "That handle isn't allowed — try another." });
          return;
        }
        if (!res.ok) throw new Error();
        setStatus({ kind: 'ok' });
        onSaved?.(normalized, displayName.trim() || null);
        requestClose();
      } catch {
        setStatus({ kind: 'error', text: 'Something went wrong. Please try again.' });
      }
    },
    [localValid, normalized, displayName, onSaved, requestClose],
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
        aria-label="Set your public handle"
        tabIndex={-1}
        className={
          'relative z-10 w-full max-w-sm border border-hairline bg-paper p-6 shadow-[0_24px_64px_rgba(17,17,16,0.28)] transition-all duration-200 ease-out focus:outline-none motion-reduce:transition-none ' +
          (show ? 'translate-y-0 opacity-100' : 'translate-y-1 opacity-0')
        }
      >
        <button
          type="button"
          onClick={requestClose}
          aria-label="Close handle dialog"
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
          <span className="kicker">Public profile</span>
          <h2 className="display text-xl">Pick a handle</h2>
          <p className="font-mono text-[11px] leading-relaxed text-mute">
            Your public palettes appear at uishades.com/u/{normalized || 'handle'}. Your
            email is never shown.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="eyebrow">Handle</span>
            <div className="flex h-10 items-center border border-ink/20 bg-paper focus-within:border-ink">
              <span aria-hidden="true" className="pl-3 font-mono text-sm text-mute">
                /u/
              </span>
              <input
                ref={inputRef}
                type="text"
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                maxLength={30}
                placeholder="yourname"
                aria-label="Handle"
                className="h-full w-full bg-transparent px-2 font-mono text-sm tracking-tight text-ink placeholder:text-mute/70 focus:outline-none"
              />
            </div>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="eyebrow">Display name (optional)</span>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={60}
              placeholder="Your Name"
              aria-label="Display name"
              className="h-10 border border-ink/20 bg-paper px-3 font-mono text-sm tracking-tight text-ink placeholder:text-mute/70 focus:border-ink focus:outline-none"
            />
          </label>

          <button
            type="submit"
            disabled={!localValid || status.kind === 'saving'}
            className="mt-1 inline-flex items-center justify-center border border-ink bg-ink px-4 py-2.5 font-mono text-sm uppercase tracking-tight text-paper transition-opacity duration-150 ease-out hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 disabled:opacity-50 motion-reduce:transition-none"
          >
            {status.kind === 'saving' ? 'Saving…' : 'Save handle'}
          </button>

          {status.kind === 'error' && (
            <p role="status" className="font-mono text-[11px] leading-relaxed text-accent">
              {status.text}
            </p>
          )}
        </form>
      </div>
    </div>,
    document.body,
  );
}
