import { useCallback, useEffect, useRef, useState } from 'react';
import PaletteCard from './PaletteCard';
import type { ExploreResponse, PaletteSummary } from '../lib/auth/types';

/**
 * ExploreGrid — the `/explore` gallery island, hosted by `explore/index.astro`.
 *
 * A filter/sort bar (Top / New / Trending / Featured segmented control + tag
 * chips + a compact color input bound to `?color=`) above a responsive grid of
 * `PaletteCard`s, with cursor-based "Load more".
 *
 * SSR hand-off: `explore/index.astro` renders the default-sort first page
 * server-side (SEO) and passes it in via `initialData` + the resolved initial
 * `sort`/`tag`/`color`. The island hydrates with that data already on screen
 * (no flash, no immediate refetch) and only queries `/api/explore` when the
 * user changes a filter or hits "Load more".
 *
 * URL-sync: sort/tag/color are mirrored into the query string via
 * `history.replaceState` (matching the app's existing URL-state style — same
 * mechanism `ShadeTool` uses for `?view=`/`?copy=`), so the current view is
 * shareable/bookmarkable. The opaque `cursor` is intentionally NOT put in the
 * URL — it's a pagination detail, not view state.
 *
 * The cursor token is round-tripped verbatim: we pass `nextCursor` straight back
 * as `?cursor=` and stop when the API returns `null`. Per the Foundation
 * contract, a cursor minted for a different sort is ignored server-side, so a
 * sort switch resets pagination cleanly — we just drop our local cursor on any
 * filter change.
 */

export type ExploreSort = 'top' | 'new' | 'trending' | 'featured';

const SORTS: { id: ExploreSort; label: string }[] = [
  { id: 'top', label: 'Top' },
  { id: 'new', label: 'New' },
  { id: 'trending', label: 'Trending' },
  { id: 'featured', label: 'Featured' },
];

/** Founder-curated tag facets. */
const TAGS = ['warm', 'cool', 'pastel', 'vibrant', 'muted', 'mono', 'dark', 'light'] as const;

interface ExploreGridProps {
  /** Server-rendered first page for the initial sort/tag/color (SEO). */
  initialData: ExploreResponse;
  initialSort?: ExploreSort;
  initialTag?: string | null;
  initialColor?: string | null;
}

export default function ExploreGrid({
  initialData,
  initialSort = 'top',
  initialTag = null,
  initialColor = null,
}: ExploreGridProps) {
  const [sort, setSort] = useState<ExploreSort>(initialSort);
  const [tag, setTag] = useState<string | null>(initialTag);
  const [color, setColor] = useState<string | null>(initialColor);

  const [items, setItems] = useState<PaletteSummary[]>(initialData.items);
  const [cursor, setCursor] = useState<string | null>(initialData.nextCursor);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  // Skip the very first query: the SSR data already reflects the initial filters.
  const seeded = useRef(true);
  // Guards against a stale in-flight response overwriting a newer filter's data.
  const reqId = useRef(0);

  const buildParams = useCallback(
    (nextCursor?: string | null) => {
      const params = new URLSearchParams();
      params.set('sort', sort);
      if (tag) params.set('tag', tag);
      if (color) params.set('color', color);
      if (nextCursor) params.set('cursor', nextCursor);
      return params;
    },
    [sort, tag, color],
  );

  // Mirror filter state into the URL (no cursor — that's pagination, not view).
  useEffect(() => {
    const params = buildParams();
    const qs = params.toString();
    const url = qs ? `?${qs}` : window.location.pathname;
    window.history.replaceState(null, '', url);
  }, [buildParams]);

  // Re-query whenever a filter changes (but not on the initial SSR-seeded mount).
  useEffect(() => {
    if (seeded.current) {
      seeded.current = false;
      return;
    }
    const id = ++reqId.current;
    setLoading(true);
    setError(false);
    fetch(`/api/explore?${buildParams().toString()}`, { credentials: 'same-origin' })
      .then((r) => (r.ok ? (r.json() as Promise<ExploreResponse>) : Promise.reject()))
      .then((data) => {
        if (id !== reqId.current) return; // a newer request superseded this one
        setItems(data.items);
        setCursor(data.nextCursor);
      })
      .catch(() => {
        if (id === reqId.current) setError(true);
      })
      .finally(() => {
        if (id === reqId.current) setLoading(false);
      });
  }, [buildParams]);

  const loadMore = useCallback(() => {
    if (!cursor || loading) return;
    const id = ++reqId.current;
    setLoading(true);
    setError(false);
    fetch(`/api/explore?${buildParams(cursor).toString()}`, { credentials: 'same-origin' })
      .then((r) => (r.ok ? (r.json() as Promise<ExploreResponse>) : Promise.reject()))
      .then((data) => {
        if (id !== reqId.current) return;
        setItems((prev) => [...prev, ...data.items]);
        setCursor(data.nextCursor);
      })
      .catch(() => {
        if (id === reqId.current) setError(true);
      })
      .finally(() => {
        if (id === reqId.current) setLoading(false);
      });
  }, [cursor, loading, buildParams]);

  const toggleTag = useCallback((t: string) => {
    setTag((cur) => (cur === t ? null : t));
  }, []);

  return (
    <div className="flex flex-col gap-8">
      {/* Filter / sort bar */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Sort segmented control */}
          <div
            role="tablist"
            aria-label="Sort palettes"
            className="inline-flex border border-ink/20"
          >
            {SORTS.map((s) => {
              const active = s.id === sort;
              return (
                <button
                  key={s.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setSort(s.id)}
                  className={
                    'px-3.5 py-2 font-mono text-[12px] uppercase tracking-tight transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 motion-reduce:transition-none ' +
                    (active ? 'bg-ink text-paper' : 'text-ink-2 hover:bg-paper-2 hover:text-ink')
                  }
                >
                  {s.label}
                </button>
              );
            })}
          </div>

          {/* Color filter */}
          <label className="inline-flex items-center gap-2">
            <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-mute">
              Filter by color
            </span>
            <input
              type="color"
              value={color ?? '#4040ff'}
              onChange={(e) => setColor(e.target.value)}
              aria-label="Filter palettes by color"
              className="h-8 w-10 cursor-pointer border border-ink/20 bg-paper p-0.5"
            />
            {color && (
              <button
                type="button"
                onClick={() => setColor(null)}
                className="font-mono text-[11px] uppercase tracking-tight text-mute transition-colors duration-150 ease-out hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
              >
                Clear
              </button>
            )}
          </label>
        </div>

        {/* Tag chips */}
        <div className="flex flex-wrap gap-2">
          {TAGS.map((t) => {
            const active = tag === t;
            return (
              <button
                key={t}
                type="button"
                aria-pressed={active}
                onClick={() => toggleTag(t)}
                className={
                  'border px-2.5 py-1 font-mono text-[11px] tracking-tight transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 motion-reduce:transition-none ' +
                  (active
                    ? 'border-accent/40 bg-accent/10 text-accent'
                    : 'border-ink/20 text-ink-2 hover:border-ink/40 hover:text-ink')
                }
              >
                #{t}
              </button>
            );
          })}
        </div>
      </div>

      {/* Results */}
      {error && (
        <p role="status" className="font-mono text-[12px] text-accent">
          Couldn't load palettes. Please try again.
        </p>
      )}

      {items.length === 0 && !loading && !error ? (
        <p className="font-mono text-[12px] text-mute">
          No palettes match these filters yet.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((p) => (
            <li key={p.id}>
              <PaletteCard palette={p} href={`/p/${p.slug}`} showCreator={false} />
            </li>
          ))}
        </ul>
      )}

      <div className="flex justify-center">
        {cursor ? (
          <button
            type="button"
            onClick={loadMore}
            disabled={loading}
            className="inline-flex items-center gap-1.5 border border-ink/20 bg-paper-2 px-5 py-2.5 font-mono text-sm uppercase tracking-tight text-ink transition-colors duration-150 ease-out hover:bg-paper-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 disabled:opacity-50 motion-reduce:transition-none"
          >
            {loading ? 'Loading…' : 'Load more'}
          </button>
        ) : (
          loading && <p className="font-mono text-[12px] text-mute">Loading…</p>
        )}
      </div>
    </div>
  );
}
