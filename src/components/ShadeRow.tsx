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
 *   - Double-click on the row body = use that shade as the new source
 *   - Cmd/Ctrl-click or middle-click on the row body = open the shade's own
 *     page in a new tab. The explicit "use as source" icon anchor is
 *     display:none in every view, so the row itself carries this (handleClick
 *     / handleAuxClick below), replicating the old anchor's modifier-click.
 *
 * Keyboard:
 *   - Enter on focused row = copy
 *   - Shift+Enter on focused row = use as source
 *   - ArrowDown/ArrowUp move focus between sibling rows (handled via DOM
 *     traversal of [data-shade-row] elements so this component stays
 *     orchestrator-agnostic).
 */

export interface ShadeRowProps {
  shade: Shade;
  /**
   * The user-selected source color. Each non-source row renders this in a
   * 20%-wide band on its left edge so users can compare the row's
   * tint/shade against the source side-by-side. The source row itself
   * (shade.isInput) skips the band - splitting source-against-source would
   * just look like a solid row.
   */
  sourceHex: Hex;
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
  sourceHex,
  copyFormat,
  brandName,
  onCopy,
  onNavigate,
}: ShadeRowProps) {
  const showSourceBand = !shade.isInput;
  const fg = useMemo(() => pickForeground(shade.hex), [shade.hex]);
  const fgClass = fg === 'white' ? 'text-white' : 'text-black';
  // Push the secondary label to 90% opacity. 70% was failing WCAG AA on
  // some mid-lightness shades (the badge text fell below 4.5:1 vs the
  // washed-out badge background). 90% keeps the visual hierarchy intact
  // while clearing the audit threshold.
  const subtleFgClass = fg === 'white' ? 'text-white/90' : 'text-black/90';

  const navHref = `/${shade.hex.slice(1)}`;

  // What the row actually shows. Mirrors the user's "Copy as" preference so
  // the displayed value matches what the click puts on the clipboard.
  // `cssVar` / `tailwindClass` need a stop to be meaningful - in the
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

  // Feature-detect clipboard availability after hydration. SSR can't tell -
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
      pushToast("Couldn't copy - clipboard is unavailable in this browser.");
      return;
    }
    navigator.clipboard.writeText(text).then(
      () => {
        // Only fire the success toast (and notify the parent) after the
        // write actually resolved - otherwise the user sees "Copied" but
        // nothing's on their clipboard. The parent's onCopy callback is
        // still useful as a "row was successfully copied" signal.
        pushToast('Copied');
        onCopy(shade.hex);
        setJustCopied(true);
      },
      () => {
        // Common rejection causes: insecure (HTTP) context, document not
        // focused, denied permission (Safari private, sandboxed iframes).
        pushToast("Couldn't copy - check browser permissions.");
      },
    );
  }, [shade.hex, shade.stop, copyFormat, brandName, onCopy, pushToast]);

  const handleClick = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      if ((e.target as HTMLElement).closest('a')) return;
      // The second click of a double-click also fires `click`, so without this
      // guard we'd copy twice (and, for modifier-clicks, open two tabs) before
      // dblclick runs. Must come before the modifier branch below.
      if (e.detail > 1) return;
      // Modifier-click opens the shade's own page in a new tab - parity with
      // the old per-row anchor's cmd/ctrl-click behavior now that the visible
      // "use as source" icon is hidden in every view.
      if (e.metaKey || e.ctrlKey) {
        window.open(navHref, '_blank', 'noopener,noreferrer');
        return;
      }
      // Without clipboard the row needs *some* affordance - fall the click
      // back to navigation so it isn't a dead element.
      if (!canCopy) {
        onNavigate(shade.hex);
        return;
      }
      handleCopy();
    },
    [handleCopy, canCopy, onNavigate, shade.hex, navHref],
  );

  // Middle-click opens the shade page in a new tab (the browser default for a
  // real link; replicated here because the row is a div, not an anchor).
  const handleAuxClick = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      if (e.button === 1) {
        e.preventDefault();
        window.open(navHref, '_blank', 'noopener,noreferrer');
      }
    },
    [navHref],
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
  // the visible label text - formatted value + (optional) stop + (optional) "source".
  const visibleLabel = [
    displayValue,
    shade.stop !== undefined ? String(shade.stop) : '',
    shade.isInput ? 'source' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const ariaLabel = canCopy
    ? `${visibleLabel}. Click to copy, double-click or Shift+Enter to use as source${shade.isInput ? ' (pinned source)' : ''}`
    : `${visibleLabel}. Click to use as source${shade.isInput ? ' (pinned source)' : ''}`;

  return (
    <div className="group relative">
    <div
      ref={rowRef}
      data-shade-row="true"
      data-hex={shade.hex}
      role="button"
      tabIndex={0}
      aria-label={ariaLabel}
      onClick={handleClick}
      onAuxClick={handleAuxClick}
      onDoubleClick={handleDoubleClick}
      onKeyDown={handleKeyDown}
      style={
        showSourceBand
          ? {
              backgroundColor: shade.hex,
              backgroundImage: `linear-gradient(to right, ${sourceHex} 20%, ${shade.hex} 20%)`,
            }
          : { backgroundColor: shade.hex }
      }
      className={[
        // Same left padding on every row so the hex label (and the source
        // row's SOURCE badge) line up with one another. Non-source rows
        // paint a 20% source-color band underneath via the linear-gradient
        // background; source row paints solid color.
        'group relative flex w-full items-center justify-between gap-3 py-3.5 pr-5 pl-[calc(20%+0.75rem)]',
        'cursor-pointer select-none',
        'motion-safe:transition-[box-shadow,transform] motion-safe:duration-150 motion-safe:ease-out',
        // A persistent transparent ring keeps `box-shadow` declared at rest so
        // the hover/focus ring fades its color in and out instead of snapping -
        // box-shadow can't transition from `none`.
        'ring-2 ring-transparent',
        'focus-visible:outline-none focus-visible:ring-current focus-visible:ring-offset-2 focus-visible:ring-offset-transparent',
        // Hover ring follows the page theme, not the swatch: `ring-ink` is the
        // `--color-ink` token - near-black in light mode, near-white in dark.
        'hover:z-20 hover:ring-ink',
        // Source row sits above its neighbors. The visual horizontal
        // overflow is drawn by two absolute spans inside the row (below)
        // so the row's layout box stays the same size as its siblings and
        // the hex label / SOURCE badge stay pixel-aligned with the rest.
        shade.isInput ? 'relative z-10' : '',
        fgClass,
      ].join(' ')}
    >
      {/* Source-row only: two absolute spans extend the visible row a
          few pixels past its left and right edges so the source row reads
          as elevated above its neighbors. They sit OUTSIDE the row's
          layout box, so the row's padding and content positions stay
          identical to sibling rows. */}
      {shade.isInput && (
        <>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 -left-2 w-2"
            style={{ backgroundColor: shade.hex }}
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 -right-2 w-2"
            style={{ backgroundColor: shade.hex }}
          />
        </>
      )}
      <div className="flex shrink-0 items-center gap-4 font-mono text-sm">
        {shade.stop !== undefined && (
          <span className={`w-10 shrink-0 text-[11px] tracking-[0.14em] uppercase ${subtleFgClass}`}>
            {shade.stop}
          </span>
        )}
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

      <div className="flex min-w-0 flex-1 items-center justify-end gap-3">
        <span
          aria-hidden="true"
          className={[
            'shrink-0 whitespace-nowrap rounded-sm px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em]',
            // Always visible on touch-only devices; faded-in on hover-capable
            // ones via the .pointer-fine-hide CSS utility in global.css.
            'pointer-fine-hide',
            fg === 'white' ? 'bg-white/15 text-white' : 'bg-black/10 text-black',
          ].join(' ')}
        >
          {canCopy ? (justCopied ? 'Copied' : 'Click to copy') : 'Click to open'}
        </span>
        <span className="min-w-0 truncate font-mono text-sm tracking-tight tabular-nums">{displayValue}</span>
      </div>
    </div>
    {!shade.isInput && (
      <>
      {/* Invisible bridge spanning the 10px gap between the row and the
          icon so a slow cursor never crosses an unhovered region (which
          would otherwise trigger a brief fade-out / fade-in cycle on the
          icon and the "Click to copy" badge). Hidden in lockstep with the
          icon below - the "use as source" icon is currently display:none in
          every view, so the bridge stays hidden too. */}
      <span
        aria-hidden="true"
        className="pointer-events-auto absolute inset-y-0 left-full hidden w-2.5"
      />
      <a
        href={navHref}
        aria-label={`Use ${shade.hex} as source`}
        title="Use as source"
        onClick={(e) => {
          e.stopPropagation();
          // Let the browser handle modifier/middle-click so cmd/ctrl-click
          // still opens the shade in a new tab - see the file's behavior
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
          'absolute top-1/2 left-full ml-2.5 -translate-y-1/2 h-[90%] aspect-square',
          // Display:none in every view. The whole row stays clickable /
          // double-clickable as the "use as source" affordance, so hiding the
          // explicit icon loses no functionality. (Kept in the DOM rather than
          // removed so the behavior can be re-enabled by restoring `lg:flex`.)
          'hidden items-center justify-center border border-transparent',
          'text-ink/60 transition-colors duration-200 ease-out hover:border-ink/20 hover:text-ink hover:bg-paper-2',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60',
          // Fade in only when the row (or anything in the group wrapper) is
          // hovered/focused - mirrors the "Click to copy" badge behavior.
          'pointer-fine-hide',
        ].join(' ')}
      >
        <OpenIcon />
      </a>
      </>
    )}
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
