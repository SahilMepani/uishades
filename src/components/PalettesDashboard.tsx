import { useCallback, useEffect, useRef, useState } from 'react';
import { ToastProvider, useToast } from './Toast';
import PaletteCard from './PaletteCard';
import HandlePrompt from './HandlePrompt';
import type { MeResponse, PaletteSummary } from '../lib/auth/types';

/**
 * PalettesDashboard — the signed-in user's private workspace island, hosted by
 * `/me/palettes`.
 *
 * Fetches `GET /api/palettes` (a `PaletteSummary[]`) on mount and lays the
 * results out in a calm grid (max 3 columns, generous whitespace). Anti-
 * overwhelm rule: every per-item verb collapses into a single `…` overflow
 * menu — Open editor (`/me/palettes/[id]`), Copy share link (`/p/[slug]`),
 * Duplicate, Delete (`DELETE /api/palettes/[id]`).
 *
 * A top "New palette" button routes to `/` (the free tool is the on-ramp;
 * palettes are built there via the "Add to palette" tray). An empty state and
 * a quota count keep the surface honest.
 *
 * The island self-wraps in `ToastProvider` (it lives outside ShadeTool's tree),
 * so `useToast` resolves here.
 */

const MAX_PALETTES = 100;

interface PalettesResponse {
  palettes: PaletteSummary[];
}

export default function PalettesDashboard() {
  return (
    <ToastProvider>
      <DashboardInner />
    </ToastProvider>
  );
}

function DashboardInner() {
  const { pushToast } = useToast();
  const [palettes, setPalettes] = useState<PaletteSummary[] | null>(null);
  const [error, setError] = useState(false);
  const [handle, setHandle] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [handleOpen, setHandleOpen] = useState(false);
  const handleBtnRef = useRef<HTMLButtonElement | null>(null);

  // Pull the current public handle/display name from the same `/api/me` probe
  // HeaderAuth uses, so the dashboard can surface "Set handle / edit public
  // name" with the existing values prefilled.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/me', { credentials: 'same-origin' })
      .then((r) => (r.ok ? (r.json() as Promise<MeResponse>) : null))
      .then((data) => {
        if (cancelled || !data) return;
        setHandle(data.handle);
        setDisplayName(data.user?.name ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/palettes', { credentials: 'same-origin' })
      .then((r) => {
        if (r.status === 401) {
          // Logged out — the page shell should have redirected, but bail safe.
          window.location.href = '/';
          return null;
        }
        return r.ok ? (r.json() as Promise<PalettesResponse>) : Promise.reject();
      })
      .then((data) => {
        if (cancelled || !data) return;
        setPalettes(data.palettes);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleDelete = useCallback(
    async (id: string) => {
      // Optimistic: drop it locally, restore on failure.
      const prev = palettes;
      setPalettes((list) => (list ? list.filter((p) => p.id !== id) : list));
      try {
        const res = await fetch(`/api/palettes/${id}`, {
          method: 'DELETE',
          credentials: 'same-origin',
        });
        if (!res.ok) throw new Error();
        pushToast('Palette deleted');
      } catch {
        setPalettes(prev);
        pushToast("Couldn't delete — please try again.");
      }
    },
    [palettes, pushToast],
  );

  const handleDuplicate = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`/api/palettes/${id}`, { credentials: 'same-origin' });
        if (!res.ok) throw new Error();
        const { palette } = (await res.json()) as {
          palette: {
            name: string;
            description: string | null;
            tags: string[];
            colors: { hex: string; view: 'scale' | 'ramp'; copyFormat: string; role: string | null }[];
          };
        };
        const create = await fetch('/api/palettes', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({
            name: `${palette.name} copy`.slice(0, 60),
            description: palette.description,
            tags: palette.tags,
            colors: palette.colors.map((c) => ({
              hex: c.hex,
              view: c.view,
              copyFormat: c.copyFormat,
              role: c.role,
            })),
          }),
        });
        if (!create.ok) throw new Error();
        const { palette: made } = (await create.json()) as { palette: PaletteSummary };
        setPalettes((list) => (list ? [made, ...list] : [made]));
        pushToast('Palette duplicated');
      } catch {
        pushToast("Couldn't duplicate — please try again.");
      }
    },
    [pushToast],
  );

  const handleCopyLink = useCallback(
    (slug: string) => {
      const url = `${window.location.origin}/p/${slug}`;
      if (!navigator.clipboard?.writeText) {
        pushToast("Couldn't copy — clipboard is unavailable.");
        return;
      }
      navigator.clipboard.writeText(url).then(
        () => pushToast('Share link copied'),
        () => pushToast("Couldn't copy — check browser permissions."),
      );
    },
    [pushToast],
  );

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="kicker">Your workspace</span>
          <h1 className="display text-3xl">Palettes</h1>
          {palettes && (
            <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-mute">
              {palettes.length} / {MAX_PALETTES} saved
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            ref={handleBtnRef}
            type="button"
            onClick={() => setHandleOpen(true)}
            className="inline-flex items-center gap-1.5 border border-ink/20 px-4 py-2.5 font-mono text-sm tracking-tight text-ink transition-colors duration-150 ease-out hover:bg-paper-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 motion-reduce:transition-none"
          >
            {handle ? (
              <>
                <span className="text-mute">/u/</span>
                <span>{handle}</span>
              </>
            ) : (
              'Set public handle'
            )}
          </button>
          <a
            href="/"
            className="inline-flex items-center gap-1.5 border border-ink/20 bg-paper-2 px-4 py-2.5 font-mono text-sm uppercase tracking-tight text-ink transition-colors duration-150 ease-out hover:bg-paper-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 motion-reduce:transition-none"
          >
            New palette
          </a>
        </div>
      </header>

      {handleOpen && (
        <HandlePrompt
          initialHandle={handle ?? ''}
          initialDisplayName={displayName ?? ''}
          onClose={() => setHandleOpen(false)}
          onSaved={(h, dn) => {
            setHandle(h);
            setDisplayName(dn);
            pushToast('Public handle saved');
          }}
          triggerRef={handleBtnRef}
        />
      )}

      {error && (
        <p role="status" className="font-mono text-[12px] text-accent">
          Couldn't load your palettes. Please refresh.
        </p>
      )}

      {palettes === null && !error && (
        <p className="font-mono text-[12px] text-mute">Loading…</p>
      )}

      {palettes && palettes.length === 0 && <EmptyState />}

      {palettes && palettes.length > 0 && (
        <ul className="grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
          {palettes.map((p) => (
            <li key={p.id}>
              <PaletteCard
                palette={p}
                href={`/me/palettes/${p.id}`}
                showVote={false}
                showCreator={false}
                action={
                  <OverflowMenu
                    onOpen={() => {
                      window.location.href = `/me/palettes/${p.id}`;
                    }}
                    onCopyLink={() => handleCopyLink(p.slug)}
                    onDuplicate={() => handleDuplicate(p.id)}
                    onDelete={() => handleDelete(p.id)}
                  />
                }
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="ed-card flex max-w-md flex-col items-start gap-4 pt-6">
      <div
        aria-hidden="true"
        className="flex h-16 w-full overflow-hidden border border-hairline"
      >
        {['#f4dccb', '#e0673c', '#b8431e', '#333333'].map((c) => (
          <span key={c} className="h-full flex-1" style={{ backgroundColor: c }} />
        ))}
      </div>
      <p className="font-display text-base text-ink-2">
        No palettes yet. Build one from any color in the tool.
      </p>
      <a
        href="/"
        className="inline-flex items-center gap-1.5 font-mono text-sm uppercase tracking-tight text-accent transition-colors duration-150 ease-out hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 motion-reduce:transition-none"
      >
        Start from a color →
      </a>
    </div>
  );
}

function OverflowMenu({
  onOpen,
  onCopyLink,
  onDuplicate,
  onDelete,
}: {
  onOpen: () => void;
  onCopyLink: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: globalThis.MouseEvent) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const run = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };

  return (
    <div ref={wrapRef} className="relative shrink-0">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Palette actions"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-8 w-8 items-center justify-center text-ink-2 transition-colors duration-150 ease-out hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 motion-reduce:transition-none"
      >
        <svg viewBox="0 0 16 16" aria-hidden="true" className="h-5 w-5">
          <circle cx="8" cy="3" r="1.4" fill="currentColor" />
          <circle cx="8" cy="8" r="1.4" fill="currentColor" />
          <circle cx="8" cy="13" r="1.4" fill="currentColor" />
        </svg>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-40 mt-1 flex w-44 flex-col border border-hairline bg-paper py-1 shadow-[0_12px_32px_rgba(17,17,16,0.14)]"
        >
          <MenuItem onClick={run(onOpen)}>Open editor</MenuItem>
          <MenuItem onClick={run(onCopyLink)}>Copy share link</MenuItem>
          <MenuItem onClick={run(onDuplicate)}>Duplicate</MenuItem>
          <MenuItem onClick={run(onDelete)} danger>
            Delete
          </MenuItem>
        </div>
      )}
    </div>
  );
}

function MenuItem({
  onClick,
  children,
  danger,
}: {
  onClick: () => void;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={
        'px-3 py-2 text-left font-mono text-[12px] tracking-tight transition-colors duration-150 ease-out hover:bg-paper-2 focus-visible:outline-none focus-visible:bg-paper-2 motion-reduce:transition-none ' +
        (danger ? 'text-accent' : 'text-ink')
      }
    >
      {children}
    </button>
  );
}
