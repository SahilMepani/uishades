import { useCallback, useState } from 'react';
import type { MeResponse } from '../lib/auth/types';

/**
 * Account controls for the left rail. Logged out: one-click Google/GitHub
 * (plain <a> GET links — redirect-flow OAuth, so the CSP `form-action 'self'`
 * is untouched) plus a passwordless magic-link email field. Logged in: identity
 * + sign out. All auth state is owned by ShadeTool; this is presentational.
 */

type AuthUser = MeResponse['user'];

interface AuthMenuProps {
  user: AuthUser;
  loading: boolean;
  onRequestMagicLink: (email: string) => Promise<void> | void;
  onLogout: () => void;
}

const OAUTH_BTN =
  'flex w-full items-center justify-center gap-2 border border-ink/20 px-3 py-2 ' +
  'font-mono text-[11px] uppercase tracking-[0.16em] text-ink ' +
  'transition-colors duration-200 ease-out hover:border-ink/40 hover:bg-paper-2 ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60';

export default function AuthMenu({ user, loading, onRequestMagicLink, onLogout }: AuthMenuProps) {
  if (loading) {
    return (
      <div className="flex flex-col gap-2">
        <span className="eyebrow">Account</span>
        <div aria-hidden="true" className="h-9 w-full animate-pulse bg-paper-2" />
      </div>
    );
  }

  if (user) {
    return <SignedIn user={user} onLogout={onLogout} />;
  }

  return <SignedOut onRequestMagicLink={onRequestMagicLink} />;
}

function SignedIn({ user, onLogout }: { user: NonNullable<AuthUser>; onLogout: () => void }) {
  const [imgFailed, setImgFailed] = useState(false);
  const label = user.name || user.email;
  const initial = (user.name || user.email || '?').trim().charAt(0).toUpperCase();
  return (
    <div className="flex flex-col gap-2">
      <span className="eyebrow">Account</span>
      <div className="flex items-center gap-3">
        {user.avatarUrl && !imgFailed ? (
          <img
            src={user.avatarUrl}
            alt=""
            width={32}
            height={32}
            onError={() => setImgFailed(true)}
            className="h-8 w-8 shrink-0 rounded-full ring-1 ring-ink/10"
          />
        ) : (
          <span
            aria-hidden="true"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink font-mono text-sm text-paper"
          >
            {initial}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm text-ink">{label}</div>
          {user.name && <div className="truncate text-xs text-mute">{user.email}</div>}
        </div>
        <button
          type="button"
          onClick={onLogout}
          className="shrink-0 border border-ink/20 px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.16em] text-ink transition-colors duration-200 ease-out hover:border-ink/40 hover:bg-paper-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}

function SignedOut({
  onRequestMagicLink,
}: {
  onRequestMagicLink: (email: string) => Promise<void> | void;
}) {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = email.trim();
      if (!trimmed || submitting) return;
      setSubmitting(true);
      try {
        await onRequestMagicLink(trimmed);
        setEmail('');
      } finally {
        setSubmitting(false);
      }
    },
    [email, submitting, onRequestMagicLink],
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <span className="eyebrow">Account</span>
        <p className="text-xs leading-relaxed text-mute">
          Sign in to save palettes across devices.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <a href="/api/auth/google" className={OAUTH_BTN}>
          Continue with Google
        </a>
        <a href="/api/auth/github" className={OAUTH_BTN}>
          Continue with GitHub
        </a>
      </div>

      <div className="flex items-center gap-2" aria-hidden="true">
        <span className="h-px flex-1 bg-hairline" />
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-mute">or</span>
        <span className="h-px flex-1 bg-hairline" />
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-2">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          spellCheck={false}
          placeholder="you@example.com"
          aria-label="Email for a sign-in link"
          className="w-full border border-ink/20 bg-paper-2 px-3 py-2 font-mono text-sm text-ink placeholder:text-mute focus:outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/30"
        />
        <button
          type="submit"
          disabled={submitting}
          className="border border-ink/20 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.16em] text-ink transition-colors duration-200 ease-out hover:border-ink/40 hover:bg-paper-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 disabled:cursor-default disabled:opacity-60"
        >
          {submitting ? 'Sending…' : 'Email me a sign-in link'}
        </button>
      </form>
    </div>
  );
}
