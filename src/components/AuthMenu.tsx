import { useCallback, useState } from 'react';
import type { MeResponse } from '../lib/auth/types';

/**
 * Account controls for the left rail. Logged out: one-click Google/GitHub
 * (plain <a> GET links - redirect-flow OAuth, so the CSP `form-action 'self'`
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
  'flex h-[38px] w-full items-center justify-center gap-2 border border-ink/20 px-4 ' +
  'font-mono text-[13px] uppercase tracking-[0.16em] text-ink ' +
  'transition-colors duration-200 ease-out hover:border-ink/40 hover:bg-paper-2 ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60';

/** Google "G" mark - official four-color logo. aria-hidden; the button text labels it. */
function GoogleIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 18 18" className="h-5 w-5 shrink-0">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
      />
    </svg>
  );
}

/** GitHub Octocat mark. Inherits text color via currentColor. */
function GitHubIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" fill="currentColor" className="h-5 w-5 shrink-0">
      <path
        fillRule="evenodd"
        d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"
      />
    </svg>
  );
}

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
        <p className="eyebrow leading-relaxed">Sign in to save palettes.</p>
      </div>

      <div className="flex flex-col gap-2">
        <a href="/api/auth/google" className={OAUTH_BTN}>
          <GoogleIcon />
          Continue with Google
        </a>
        <a href="/api/auth/github" className={OAUTH_BTN}>
          <GitHubIcon />
          Continue with GitHub
        </a>
      </div>

      <div className="my-2 flex items-center gap-2" aria-hidden="true">
        <span className="h-px flex-1 bg-hairline" />
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-mute">or</span>
        <span className="h-px flex-1 bg-hairline" />
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-1.5">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          spellCheck={false}
          placeholder="you@example.com"
          aria-label="Email for a sign-in link"
          className="h-[38px] w-full border border-ink/20 bg-paper-2 px-4 font-mono text-[14px] text-ink placeholder:text-mute focus:outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/30"
        />
        <button
          type="submit"
          disabled={submitting}
          className="flex h-[38px] items-center justify-center bg-ink px-4 font-mono text-[13px] uppercase tracking-[0.16em] text-paper transition-colors duration-200 ease-out hover:bg-ink/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 disabled:cursor-default disabled:opacity-60"
        >
          {submitting ? 'Sending…' : 'Email me a sign-in link'}
        </button>
      </form>
    </div>
  );
}
