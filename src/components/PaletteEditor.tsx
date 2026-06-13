import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ToastProvider, useToast } from './Toast';
import ColorPicker from './ColorPicker';
import ShareRow from './ShareRow';
import MockPreview from './MockPreview';
import type { Palette, PaletteColor, PaletteRole } from '../lib/auth/types';
import type { CopyFormat, Hex } from '../lib/color/types';

/**
 * PaletteEditor - the owner-only editor island hosted by `/me/palettes/[id]`.
 *
 * Loads `GET /api/palettes/[id]` (returns `{ palette }`). Surfaces:
 *  - a prominent inline-editable palette NAME (PATCH on blur, ≤60 chars) +
 *    optional description (PATCH on blur);
 *  - a reorderable list of color slots, each opening the shared
 *    `ColorPicker`; add / remove / move-up / move-down; "shuffle roles";
 *  - a `MockPreview` panel fed `{ hex, role }[]`;
 *  - a `ShareRow` (suppressed on `/me/*` by ShareRow's own guard - see note);
 *  - delete.
 *
 * Color edits (add/remove/reorder/recolor/role-shuffle) are persisted by
 * PATCHing the full `colors` array - the server deletes + reinserts and
 * recomputes hue buckets, per the DB contract.
 *
 * The palette id is read from the path (`/me/palettes/[id]`); the page shell
 * already 404s non-owners, so the island assumes ownership.
 */

const MIN_COLORS = 1;
const ROLE_ORDER: PaletteRole[] = ['bg', 'surface', 'accent', 'text', 'extra'];

interface PaletteResponse {
  palette: Palette;
}

/** Role auto-assignment by position, mirroring the DB default. */
function roleForPosition(i: number): PaletteRole {
  return i < ROLE_ORDER.length - 1 ? ROLE_ORDER[i] : 'extra';
}

function paletteIdFromPath(): string {
  if (typeof window === 'undefined') return '';
  const m = window.location.pathname.match(/\/me\/palettes\/([^/]+)/);
  return m ? decodeURIComponent(m[1]) : '';
}

export default function PaletteEditor() {
  return (
    <ToastProvider>
      <EditorInner />
    </ToastProvider>
  );
}

function EditorInner() {
  const { pushToast } = useToast();
  const id = useMemo(paletteIdFromPath, []);
  const [palette, setPalette] = useState<Palette | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!id) {
      setError(true);
      return;
    }
    let cancelled = false;
    fetch(`/api/palettes/${id}`, { credentials: 'same-origin' })
      .then((r) => {
        if (r.status === 401) {
          window.location.href = '/';
          return null;
        }
        return r.ok ? (r.json() as Promise<PaletteResponse>) : Promise.reject();
      })
      .then((data) => {
        if (cancelled || !data) return;
        setPalette(data.palette);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  // PATCH a partial and merge the server's canonical palette back in.
  const patch = useCallback(
    async (
      body: Record<string, unknown>,
      okMsg?: string,
    ): Promise<boolean> => {
      try {
        const res = await fetch(`/api/palettes/${id}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error();
        const { palette: next } = (await res.json()) as PaletteResponse;
        setPalette(next);
        if (okMsg) pushToast(okMsg);
        return true;
      } catch {
        pushToast("Couldn't save - please try again.");
        return false;
      }
    },
    [id, pushToast],
  );

  const persistColors = useCallback(
    (colors: PaletteColor[], okMsg?: string) =>
      patch(
        {
          colors: colors.map((c) => ({
            hex: c.hex,
            view: c.view,
            copyFormat: c.copyFormat,
            role: c.role,
          })),
        },
        okMsg,
      ),
    [patch],
  );

  const handleColorChange = useCallback(
    (position: number, next: Hex) => {
      if (!palette) return;
      const colors = palette.colors.map((c) =>
        c.position === position ? { ...c, hex: next } : c,
      );
      persistColors(colors);
    },
    [palette, persistColors],
  );

  const handleAddColor = useCallback(() => {
    if (!palette) return;
    const last = palette.colors[palette.colors.length - 1];
    const position = palette.colors.length;
    const added: PaletteColor = {
      position,
      hex: last?.hex ?? '#4040ff',
      view: last?.view ?? 'scale',
      copyFormat: last?.copyFormat ?? 'hex',
      role: roleForPosition(position),
      hueBucket: null,
    };
    persistColors([...palette.colors, added]);
  }, [palette, persistColors]);

  const handleRemoveColor = useCallback(
    (position: number) => {
      if (!palette || palette.colors.length <= MIN_COLORS) return;
      const colors = palette.colors
        .filter((c) => c.position !== position)
        .map((c, i) => ({ ...c, position: i }));
      persistColors(colors);
    },
    [palette, persistColors],
  );

  const handleMove = useCallback(
    (position: number, dir: -1 | 1) => {
      if (!palette) return;
      const idx = palette.colors.findIndex((c) => c.position === position);
      const target = idx + dir;
      if (idx < 0 || target < 0 || target >= palette.colors.length) return;
      const next = [...palette.colors];
      [next[idx], next[target]] = [next[target], next[idx]];
      persistColors(next.map((c, i) => ({ ...c, position: i })));
    },
    [palette, persistColors],
  );

  const handleShuffleRoles = useCallback(() => {
    if (!palette) return;
    // "Shuffle roles" cycles each color's role one step forward through the
    // canonical order, keeping positions intact.
    const colors = palette.colors.map((c) => {
      const cur = c.role ? ROLE_ORDER.indexOf(c.role) : -1;
      const nextRole = ROLE_ORDER[(cur + 1 + ROLE_ORDER.length) % ROLE_ORDER.length];
      return { ...c, role: nextRole };
    });
    persistColors(colors, 'Roles shuffled');
  }, [palette, persistColors]);

  const handleDelete = useCallback(async () => {
    if (!window.confirm('Delete this palette? This cannot be undone.')) return;
    try {
      const res = await fetch(`/api/palettes/${id}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      });
      if (!res.ok) throw new Error();
      window.location.href = '/me/palettes';
    } catch {
      pushToast("Couldn't delete - please try again.");
    }
  }, [id, pushToast]);

  if (error) {
    return (
      <p role="status" className="font-mono text-[12px] text-accent">
        Couldn't load this palette.
      </p>
    );
  }
  if (!palette) {
    return <p className="font-mono text-[12px] text-mute">Loading…</p>;
  }

  const mockColors = palette.colors.map((c) => ({
    hex: c.hex,
    role: c.role ?? undefined,
  }));

  return (
    <div className="flex flex-col gap-8">
      <EditableName
        name={palette.name}
        onCommit={(name) => {
          if (name && name !== palette.name) patch({ name });
        }}
      />

      <EditableDescription
        description={palette.description}
        onCommit={(description) => {
          if (description !== (palette.description ?? '')) {
            patch({ description: description || null });
          }
        }}
      />

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <span className="eyebrow">Colors ({palette.colors.length})</span>
          <button
            type="button"
            onClick={handleShuffleRoles}
            className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-2 transition-colors duration-150 ease-out hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 motion-reduce:transition-none"
          >
            Shuffle roles
          </button>
        </div>

        <ul className="flex flex-col gap-2">
          {palette.colors.map((c, i) => (
            <ColorSlot
              key={c.position}
              color={c}
              isFirst={i === 0}
              isLast={i === palette.colors.length - 1}
              canRemove={palette.colors.length > MIN_COLORS}
              onChange={(next) => handleColorChange(c.position, next)}
              onMoveUp={() => handleMove(c.position, -1)}
              onMoveDown={() => handleMove(c.position, 1)}
              onRemove={() => handleRemoveColor(c.position)}
            />
          ))}
        </ul>

        <button
          type="button"
          onClick={handleAddColor}
          className="inline-flex w-fit items-center gap-1.5 border border-ink/20 px-3 py-2 font-mono text-[12px] uppercase tracking-tight text-ink transition-colors duration-150 ease-out hover:bg-paper-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 motion-reduce:transition-none"
        >
          + Add color
        </button>
      </section>

      <section className="flex flex-col gap-3">
        <span className="eyebrow">Preview</span>
        <MockPreview colors={mockColors} />
      </section>

      <ShareRow hex={(palette.colors[0]?.hex ?? '#4040ff') as Hex} />

      <section className="ed-card flex items-center justify-between gap-3 pt-4">
        <span className="font-mono text-[11px] text-mute">
          Created {new Date(palette.createdAt).toLocaleDateString()}
        </span>
        <button
          type="button"
          onClick={handleDelete}
          className="font-mono text-[12px] uppercase tracking-tight text-accent transition-opacity duration-150 ease-out hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 motion-reduce:transition-none"
        >
          Delete palette
        </button>
      </section>
    </div>
  );
}

function EditableName({
  name,
  onCommit,
}: {
  name: string;
  onCommit: (next: string) => void;
}) {
  const [value, setValue] = useState(name);
  useEffect(() => setValue(name), [name]);
  return (
    <div className="flex flex-col gap-1">
      <span className="eyebrow">Palette name</span>
      <input
        type="text"
        value={value}
        maxLength={60}
        aria-label="Palette name"
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => onCommit(value.trim().slice(0, 60))}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
        className="display w-full border-b border-transparent bg-transparent pb-1 text-3xl text-ink transition-colors duration-150 ease-out hover:border-hairline focus:border-ink focus:outline-none motion-reduce:transition-none"
      />
    </div>
  );
}

function EditableDescription({
  description,
  onCommit,
}: {
  description: string | null;
  onCommit: (next: string) => void;
}) {
  const [value, setValue] = useState(description ?? '');
  useEffect(() => setValue(description ?? ''), [description]);
  return (
    <label className="flex flex-col gap-1">
      <span className="eyebrow">Description (optional)</span>
      <textarea
        value={value}
        rows={2}
        maxLength={280}
        aria-label="Palette description"
        placeholder="A short note about this palette…"
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => onCommit(value.trim())}
        className="resize-none border border-ink/20 bg-paper px-3 py-2 font-mono text-sm leading-relaxed text-ink placeholder:text-mute/70 focus:border-ink focus:outline-none"
      />
    </label>
  );
}

function ColorSlot({
  color,
  isFirst,
  isLast,
  canRemove,
  onChange,
  onMoveUp,
  onMoveDown,
  onRemove,
}: {
  color: PaletteColor;
  isFirst: boolean;
  isLast: boolean;
  canRemove: boolean;
  onChange: (next: Hex) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
}) {
  return (
    <li className="flex items-center gap-3 border border-hairline bg-paper-2 p-2">
      <ColorPicker
        hex={color.hex}
        onChange={onChange}
        copyFormat={color.copyFormat as CopyFormat}
        triggerLabel={`Color ${color.hex} - open color picker`}
        className="block h-10 w-10 shrink-0"
      >
        <span
          aria-hidden="true"
          className="block h-10 w-10 border border-ink/15"
          style={{ backgroundColor: color.hex }}
        />
      </ColorPicker>

      <div className="flex min-w-0 flex-1 flex-col">
        <span className="font-mono text-sm tracking-tight text-ink">
          {color.hex.toUpperCase()}
        </span>
        {color.role && (
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-mute">
            {color.role}
          </span>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-0.5">
        <IconBtn label="Move up" disabled={isFirst} onClick={onMoveUp}>
          <path d="M8 11.5V4.5M4.5 8 8 4.5 11.5 8" />
        </IconBtn>
        <IconBtn label="Move down" disabled={isLast} onClick={onMoveDown}>
          <path d="M8 4.5v7M4.5 8l3.5 3.5L11.5 8" />
        </IconBtn>
        <IconBtn label="Remove color" disabled={!canRemove} onClick={onRemove} danger>
          <path d="M3 3l10 10M13 3L3 13" />
        </IconBtn>
      </div>
    </li>
  );
}

function IconBtn({
  label,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={
        'inline-flex h-8 w-8 items-center justify-center transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 disabled:opacity-30 motion-reduce:transition-none ' +
        (danger ? 'text-ink-2 hover:text-accent' : 'text-ink-2 hover:text-ink')
      }
    >
      <svg
        viewBox="0 0 16 16"
        aria-hidden="true"
        className="h-4 w-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {children}
      </svg>
    </button>
  );
}

