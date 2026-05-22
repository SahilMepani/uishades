import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import type { Shade, CopyFormat, Hex } from '../lib/color/types';
import { contrastRatio } from '../lib/color/contrast';
import { formatForCopy } from '../lib/color/format';
import { useToast } from './Toast';

/**
 * A single row in either the continuous ramp or the Tailwind scale.
 *
 * Behavior contract (per the spec):
 *   - Click on the row body = copy hex (or current copy-format preference)
 *   - Double-click on the row body = navigate to that shade's page
 *   - Cmd/Ctrl-click on the navigate link = browser-native open-in-new-tab
 *     (we use a real `<a>` for the navigate icon, not a JS handler)
 *   - Mobile: icons always shown; Desktop: icons revealed on hover/focus
 *
 * Keyboard:
 *   - Enter on focused row = copy
 *   - Shift+Enter on focused row = navigate
 *   - ArrowDown/ArrowUp move focus between sibling rows (handled via DOM
 *     traversal of [data-shade-row] elements so this component stays
 *     orchestrator-agnostic).
 */

export interface ShadeRowProps {
  shade: Shade;
  copyFormat: CopyFormat;
  brandName?: string;
  onCopy: (hex: Hex) => void;
  onNavigate: (hex: Hex) => void;
}

const WHITE = '#ffffff';
const BLACK = '#000000';

function pickForeground(hex: Hex): 'white' | 'black' {
  const cw = contrastRatio(hex, WHITE);
  const cb = contrastRatio(hex, BLACK);
  return cw >= cb ? 'white' : 'black';
}

export default function ShadeRow({
  shade,
  copyFormat,
  brandName,
  onCopy,
  onNavigate,
}: ShadeRowProps) {
  const fg = useMemo(() => pickForeground(shade.hex), [shade.hex]);
  const fgClass = fg === 'white' ? 'text-white' : 'text-black';
  // Push the secondary label to 90% opacity. 70% was failing WCAG AA on
  // some mid-lightness shades (the badge text fell below 4.5:1 vs the
  // washed-out badge background). 90% keeps the visual hierarchy intact
  // while clearing the audit threshold.
  const subtleFgClass = fg === 'white' ? 'text-white/90' : 'text-black/90';
  const ringHoverClass = fg === 'white' ? 'ring-white/40' : 'ring-black/30';

  const navHref = `/${shade.hex.slice(1)}`;

  // What the row actually shows. Mirrors the user's "Copy as" preference so
  // the displayed value matches what the click puts on the clipboard.
  // `cssVar` / `tailwindClass` need a stop to be meaningful — in the
  // continuous ramp (no stops) we fall back to hex so the column isn't a
  // wall of identical labels.
  const displayValue = useMemo(() => {
    const needsStop = copyFormat === 'cssVar' || copyFormat === 'tailwindClass';
    if (needsStop && shade.stop === undefined) return shade.hex;
    return formatForCopy(shade.hex, copyFormat, {
      name: brandName,
      stop: shade.stop,
    });
  }, [shade.hex, shade.stop, copyFormat, brandName]);

  const { pushToast } = useToast();

  // Feature-detect clipboard availability after hydration. SSR can't tell —
  // `navigator` is undefined and the secure-context rule is browser-specific
  // anyway. Default to `true` so SSR + first paint match, then flip to
  // `false` once we know better. When unavailable we hide the copy icon and
  // fall row-clicks back to navigate so the row still has an action.
  const [canCopy, setCanCopy] = useState(true);
  useEffect(() => {
    if (
      typeof navigator === 'undefined' ||
      !navigator.clipboard ||
      typeof navigator.clipboard.writeText !== 'function'
    ) {
      setCanCopy(false);
    }
  }, []);

  const [justCopied, setJustCopied] = useState(false);
  const rowRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!justCopied) return;
    const onDocPointerDown = (e: Event) => {
      const target = e.target as Node | null;
      if (target && rowRef.current && rowRef.current.contains(target)) return;
      setJustCopied(false);
    };
    document.addEventListener('pointerdown', onDocPointerDown);
    return () => document.removeEventListener('pointerdown', onDocPointerDown);
  }, [justCopied]);

  const handleCopy = useCallback(() => {
    const text = formatForCopy(shade.hex, copyFormat, {
      name: brandName,
      stop: shade.stop,
    });
    if (
      typeof navigator === 'undefined' ||
      !navigator.clipboard ||
      typeof navigator.clipboard.writeText !== 'function'
    ) {
      pushToast("Couldn't copy — clipboard is unavailable in this browser.");
      return;
    }
    navigator.clipboard.writeText(text).then(
      () => {
        // Only fire the success toast (and notify the parent) after the
        // write actually resolved — otherwise the user sees "Copied" but
        // nothing's on their clipboard. The parent's onCopy callback is
        // still useful as a "row was successfully copied" signal.
        pushToast('Copied');
        onCopy(shade.hex);
        setJustCopied(true);
      },
      () => {
        // Common rejection causes: insecure (HTTP) context, document not
        // focused, denied permission (Safari private, sandboxed iframes).
        pushToast("Couldn't copy — check browser permissions.");
      },
    );
  }, [shade.hex, shade.stop, copyFormat, brandName, onCopy, pushToast]);

  const handleClick = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      if ((e.target as HTMLElement).closest('a')) return;
      // The second click of a double-click also fires `click`, so without
      // this guard we'd copy twice (and toast twice) before dblclick runs.
      if (e.detail > 1) return;
      // Without clipboard the row needs *some* affordance — fall the click
      // back to navigation so it isn't a dead element.
      if (!canCopy) {
        onNavigate(shade.hex);
        return;
      }
      handleCopy();
    },
    [handleCopy, canCopy, onNavigate, shade.hex],
  );

  const handleDoubleClick = useCallback(() => {
    onNavigate(shade.hex);
  }, [shade.hex, onNavigate]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (e.shiftKey) {
          onNavigate(shade.hex);
        } else {
          handleCopy();
        }
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const dir = e.key === 'ArrowDown' ? 1 : -1;
        const rows = Array.from(
          document.querySelectorAll<HTMLDivElement>('[data-shade-row="true"]'),
        );
        const idx = rows.indexOf(e.currentTarget);
        const next = rows[idx + dir];
        if (next) next.focus();
      }
    },
    [shade.hex, handleCopy, onNavigate],
  );

  // WCAG 2.5.3 (Label in Name) requires the accessible name to start with
  // the visible label text — formatted value + (optional) stop + (optional) "source".
  const visibleLabel = [
    displayValue,
    shade.stop !== undefined ? String(shade.stop) : '',
    shade.isInput ? 'source' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const ariaLabel = canCopy
    ? `${visibleLabel}. Click to copy, double-click to open page${shade.isInput ? ' (pinned source)' : ''}`
    : `${visibleLabel}. Click to open page${shade.isInput ? ' (pinned source)' : ''}`;

  return (
    <div
      ref={rowRef}
      data-shade-row="true"
      data-hex={shade.hex}
      role="button"
      tabIndex={0}
      aria-label={ariaLabel}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onKeyDown={handleKeyDown}
      style={{ backgroundColor: shade.hex }}
      className={[
        'group relative flex w-full items-center justify-between gap-3 px-5 py-3.5',
        'cursor-pointer select-none',
        'motion-safe:transition-[transform,box-shadow]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent',
        `hover:ring-2 hover:ring-inset ${ringHoverClass}`,
        shade.isInput
          ? fg === 'white'
            ? 'relative z-10 scale-[1.03] shadow-[0_10px_28px_-6px_rgba(0,0,0,0.45),0_4px_10px_-4px_rgba(0,0,0,0.35)]'
            : 'relative z-10 scale-[1.03] shadow-[0_8px_22px_-8px_rgba(0,0,0,0.18),0_2px_6px_-3px_rgba(0,0,0,0.14)]'
          : '',
        fgClass,
      ].join(' ')}
    >
      <div className="flex items-center gap-4 font-mono text-sm">
        {shade.stop !== undefined && (
          <span className={`w-10 shrink-0 text-[11px] tracking-[0.14em] uppercase ${subtleFgClass}`}>
            {shade.stop}
          </span>
        )}
        <span className="truncate tracking-tight tabular-nums">{displayValue}</span>
        {shade.isInput && (
          <span
            className={
              'px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] ' +
              (fg === 'white' ? 'bg-white text-black' : 'bg-black text-white')
            }
          >
            Source
          </span>
        )}
      </div>

      <div
        className={[
          'flex items-center gap-2',
          // Always visible on touch-only devices; faded-in on hover-capable
          // ones via the .pointer-fine-hide CSS utility in global.css.
          'pointer-fine-hide',
        ].join(' ')}
      >
        <span
          aria-hidden="true"
          className={[
            'rounded-sm px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em]',
            fg === 'white' ? 'bg-white/15 text-white' : 'bg-black/10 text-black',
          ].join(' ')}
        >
          {canCopy ? (justCopied ? 'Copied' : 'Click to copy') : 'Click to open'}
        </span>
        {!shade.isInput && (
          <a
            href={navHref}
            aria-label={`Open page for ${shade.hex}`}
            onClick={(e) => {
              e.stopPropagation();
              // Let the browser handle modifier/middle-click so cmd/ctrl-click
              // still opens the shade in a new tab — see the file's behavior
              // contract above. Plain left-click stays on the page and lets
              // the parent swap the hex in place.
              if (
                e.metaKey ||
                e.ctrlKey ||
                e.shiftKey ||
                e.altKey ||
                e.button !== 0
              ) {
                return;
              }
              e.preventDefault();
              onNavigate(shade.hex);
            }}
            className={[
              'rounded p-1',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1',
              fg === 'white' ? 'bg-white/15' : 'bg-black/10',
            ].join(' ')}
          >
            <OpenIcon />
          </a>
        )}
      </div>
    </div>
  );
}

function OpenIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="h-4 w-4">
      <path d="M11.2 1.6a2.2 2.2 0 0 1 3.1 3.1l-1.4 1.4-3.1-3.1 1.4-1.4Z" fill="currentColor" />
      <path d="m9.1 3.7 3.1 3.1-6.6 6.6-3.1-.5L2 9.8 9.1 3.7Z" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" />
    </svg>
  );
}
