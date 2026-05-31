import { useCallback, useEffect, useState } from 'react';
import { useToast } from './Toast';
import type { Hex } from '../lib/color/types';

/**
 * Inline social share row mounted inside the PreviewBlock and the mobile
 * controls strip in ShadeTool.
 *
 * Four actions: Copy URL, X/Twitter, Pinterest, and (mobile only,
 * capability-detected) the native Web Share sheet. The Pinterest button
 * uses the portrait /og/pin/<hex>.png variant as its media source since
 * Pinterest's feed is portrait-first.
 *
 * The "URL" we share is whatever `window.location` currently is, with any
 * one-shot params (e.g. `seed`) stripped - this preserves deep-linked
 * `?view=scale&mode=oklch` style state but doesn't leak raw user input.
 * On /dev/* and /me/* the whole row is hidden, since those URLs 404 in
 * production or are private editor routes that shouldn't be shared.
 *
 * Palette pages override the hex-derived defaults via the optional props:
 *   - `shareUrl` - the canonical URL to share (e.g. `/p/[slug]`); overrides
 *     the `window.location`-derived default.
 *   - `title` - the share title; overrides the "Tints and shades of …" default.
 *   - `pinMedia` - the Pinterest media image URL; overrides the per-hex
 *     `/og/pin/<hex>.png` default.
 * Existing `/[hex]` callers pass none of these and behave exactly as before.
 */

interface NamedColor {
  name: string;
  slug: string;
}

interface ShareRowProps {
  hex: Hex;
  named?: NamedColor | null;
  /** Override the shared URL (default: current location, `seed` stripped). */
  shareUrl?: string;
  /** Override the share title (default: "Tints and shades of <label> - UIshades.com"). */
  title?: string;
  /** Override the Pinterest media image (default: `/og/pin/<hex>.png`). */
  pinMedia?: string;
}

function shareUrlFor(
  platform: 'twitter' | 'pinterest',
  url: string,
  title: string,
  mediaUrl?: string,
): string {
  const u = encodeURIComponent(url);
  const t = encodeURIComponent(title);
  switch (platform) {
    case 'twitter':
      return `https://twitter.com/intent/tweet?text=${t}&url=${u}`;
    case 'pinterest': {
      const m = encodeURIComponent(mediaUrl ?? '');
      return `https://www.pinterest.com/pin/create/button/?url=${u}&media=${m}&description=${t}`;
    }
  }
}

export default function ShareRow({ hex, named, shareUrl, title, pinMedia }: ShareRowProps) {
  const { pushToast } = useToast();
  const [canNativeShare, setCanNativeShare] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    // Suppress on the dev hosting route (those URLs 404 in production) and on
    // the private `/me/*` editor routes (sharing a private editor URL would
    // produce a dead/owner-only link).
    const path = window.location.pathname;
    if (path.startsWith('/dev/') || path.startsWith('/me/')) {
      setHidden(true);
      return;
    }
    setCanNativeShare(
      typeof navigator !== 'undefined' &&
        typeof navigator.share === 'function',
    );
  }, []);

  const buildPayload = useCallback(() => {
    // An explicit `shareUrl` (e.g. /p/[slug]) wins; otherwise derive from the
    // current location with one-shot params stripped. A relative override is
    // resolved against the current origin so the copied/opened link is absolute.
    let url = '';
    if (shareUrl) {
      try {
        url = new URL(shareUrl, window.location.origin).toString();
      } catch {
        url = shareUrl;
      }
    } else {
      try {
        const u = new URL(window.location.href);
        u.searchParams.delete('seed');
        url = u.toString();
      } catch {
        url = window.location.href;
      }
    }
    const label = named ? `${named.name} (${hex.toUpperCase()})` : hex.toUpperCase();
    const resolvedTitle = title ?? `Tints and shades of ${label} - UIshades.com`;
    return { url, title: resolvedTitle };
  }, [hex, named, shareUrl, title]);

  const pinterestMediaUrl = useCallback((): string => {
    const fallbackOrigin = 'https://UIshades.com';
    if (pinMedia) {
      try {
        return new URL(pinMedia, window.location.origin).toString();
      } catch {
        return pinMedia;
      }
    }
    try {
      const origin = window.location.origin;
      return `${origin}/og/pin/${hex.slice(1)}.png`;
    } catch {
      return `${fallbackOrigin}/og/pin/${hex.slice(1)}.png`;
    }
  }, [hex, pinMedia]);

  const handleCopy = useCallback(() => {
    if (typeof window === 'undefined') return;
    const { url } = buildPayload();
    if (
      typeof navigator === 'undefined' ||
      !navigator.clipboard ||
      typeof navigator.clipboard.writeText !== 'function'
    ) {
      pushToast("Couldn't copy - clipboard is unavailable in this browser.");
      return;
    }
    navigator.clipboard.writeText(url).then(
      () => pushToast('URL copied'),
      () => pushToast("Couldn't copy - check browser permissions."),
    );
  }, [buildPayload, pushToast]);

  const openShare = useCallback(
    (platform: 'twitter' | 'pinterest') => {
      if (typeof window === 'undefined') return;
      const { url, title } = buildPayload();
      const media = platform === 'pinterest' ? pinterestMediaUrl() : undefined;
      const shareUrl = shareUrlFor(platform, url, title, media);
      window.open(
        shareUrl,
        '_blank',
        'width=600,height=540,noopener,noreferrer',
      );
    },
    [buildPayload, pinterestMediaUrl],
  );

  const handleNativeShare = useCallback(async () => {
    if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') return;
    const { url, title } = buildPayload();
    try {
      await navigator.share({ title, text: title, url });
    } catch {
      // User cancelled or share unsupported for this payload - no toast.
    }
  }, [buildPayload]);

  if (hidden) return null;

  return (
    <div className="flex flex-col gap-2">
      <span className="eyebrow">Share</span>
      <div className="-mx-2.5 flex flex-wrap items-center gap-0.5">
        <ShareButton label="Copy link to this color" onClick={handleCopy}>
          <LinkIcon />
        </ShareButton>
        <ShareButton label="Share on X" onClick={() => openShare('twitter')}>
          <XIcon />
        </ShareButton>
        <ShareButton label="Save to Pinterest" onClick={() => openShare('pinterest')}>
          <PinterestIcon />
        </ShareButton>
        {canNativeShare && (
          <ShareButton label="More sharing options" onClick={handleNativeShare}>
            <NativeShareIcon />
          </ShareButton>
        )}
      </div>
    </div>
  );
}

function ShareButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={
        // 44px hit target (Apple HIG / Material minimum), 24px icon inside.
        'inline-flex h-11 w-11 items-center justify-center text-ink-2 ' +
        // Only the icon scales on hover/focus - the 44px button box stays put.
        '[&>svg]:h-6 [&>svg]:w-6 [&>svg]:transition-transform [&>svg]:duration-200 [&>svg]:ease-out ' +
        'hover:[&>svg]:scale-110 focus-visible:[&>svg]:scale-110 ' +
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60'
      }
    >
      {children}
    </button>
  );
}

function LinkIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className ?? 'h-6 w-6'}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9 17H7A5 5 0 0 1 7 7h2" />
      <path d="M15 7h2a5 5 0 1 1 0 10h-2" />
      <line x1="8" x2="16" y1="12" y2="12" />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className ?? 'h-6 w-6'}>
      <path
        d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231zm-1.161 17.52h1.833L7.084 4.126H5.117l11.966 15.644z"
        fill="currentColor"
      />
    </svg>
  );
}

function PinterestIcon({ className }: { className?: string }) {
  // Simplified "P" badge - the full brand logo's swirl tail reads as noise
  // at 24px, so this keeps the rounded mark and circle outline only.
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className ?? 'h-6 w-6'}>
      <path
        d="M12 2C6.48 2 2 6.48 2 12c0 4.24 2.64 7.86 6.36 9.32-.09-.79-.17-2.01.03-2.88.18-.78 1.17-4.97 1.17-4.97s-.3-.6-.3-1.48c0-1.39.8-2.42 1.8-2.42.85 0 1.26.64 1.26 1.4 0 .85-.54 2.13-.82 3.31-.24.99.5 1.8 1.48 1.8 1.77 0 3.13-1.87 3.13-4.57 0-2.39-1.72-4.06-4.17-4.06-2.84 0-4.51 2.13-4.51 4.34 0 .86.33 1.78.74 2.28a.3.3 0 0 1 .07.29c-.07.3-.24.99-.27 1.13-.04.18-.14.22-.33.13-1.23-.57-2-2.37-2-3.81 0-3.1 2.25-5.95 6.5-5.95 3.41 0 6.06 2.43 6.06 5.68 0 3.39-2.14 6.12-5.1 6.12-1 0-1.93-.52-2.25-1.13l-.61 2.34c-.22.85-.82 1.92-1.22 2.57.92.28 1.89.44 2.91.44 5.52 0 10-4.48 10-10S17.52 2 12 2z"
        fill="currentColor"
      />
    </svg>
  );
}

function NativeShareIcon({ className }: { className?: string }) {
  // Lucide "send" - an upward paper plane. Stroke style matches the
  // Copy-link icon so the row reads as a coherent set.
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      // Nudged down 3px so the upward paper plane sits on the same optical
      // baseline as the other share icons. translate-y composes with the
      // button's hover scale-110 via Tailwind's shared transform vars.
      className={className ?? 'h-6 w-6 translate-y-[3px]'}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M22 2 11 13" />
      <path d="m22 2-7 20-4-9-9-4Z" />
    </svg>
  );
}
