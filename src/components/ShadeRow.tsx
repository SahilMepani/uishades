import { useCallback, useMemo, type KeyboardEvent, type MouseEvent } from 'react';
import type { Shade, CopyFormat, Hex } from '../lib/color/types';
import { contrastRatio, wcagLevel } from '../lib/color/contrast';
import { formatForCopy } from '../lib/color/format';

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
  const subtleFgClass = fg === 'white' ? 'text-white/70' : 'text-black/70';
  const ringHoverClass = fg === 'white' ? 'ring-white/40' : 'ring-black/30';

  const ratioW = contrastRatio(shade.hex, WHITE);
  const ratioB = contrastRatio(shade.hex, BLACK);
  const levelW = wcagLevel(ratioW);
  const levelB = wcagLevel(ratioB);

  const navHref = `/${shade.hex.slice(1)}`;

  const handleCopy = useCallback(() => {
    const text = formatForCopy(shade.hex, copyFormat, {
      name: brandName,
      stop: shade.stop,
    });
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text).catch(() => {
        /* swallow; the toast still fires so the UX isn't broken */
      });
    }
    onCopy(shade.hex);
  }, [shade.hex, shade.stop, copyFormat, brandName, onCopy]);

  const handleClick = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      if ((e.target as HTMLElement).closest('a')) return;
      handleCopy();
    },
    [handleCopy],
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

  const ariaLabel = [
    shade.stop ? `Stop ${shade.stop}, ` : '',
    `Color ${shade.hex}.`,
    shade.isInput ? ' Pinned input color.' : '',
    ' Click to copy, double-click to open page.',
  ].join('');

  return (
    <div
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
        'group relative flex w-full items-center justify-between gap-3 px-4 py-3',
        'cursor-pointer select-none',
        'motion-safe:transition-shadow',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent',
        `hover:ring-2 hover:ring-inset ${ringHoverClass}`,
        shade.isInput ? 'shadow-[inset_0_0_0_2px_currentColor]' : '',
        fgClass,
      ].join(' ')}
    >
      <div className="flex items-baseline gap-3 font-mono text-sm">
        <span className="tabular-nums">{shade.hex}</span>
        {shade.stop !== undefined && (
          <span className={`text-xs ${subtleFgClass}`}>{shade.stop}</span>
        )}
        {shade.isInput && (
          <span
            className={
              'rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ' +
              (fg === 'white' ? 'bg-white/20' : 'bg-black/15')
            }
          >
            input
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <div className={`flex items-center gap-1.5 font-mono text-[10px] ${subtleFgClass}`}>
          <ContrastBadge against="white" level={levelW} ratio={ratioW} fg={fg} />
          <ContrastBadge against="black" level={levelB} ratio={ratioB} fg={fg} />
        </div>

        <div
          className={[
            'flex items-center gap-1',
            // Always visible on mobile (no hover); revealed on hover/focus on desktop.
            'opacity-100 lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100',
            'motion-safe:transition-opacity',
          ].join(' ')}
        >
          <button
            type="button"
            aria-label={`Copy ${shade.hex}`}
            onClick={(e) => {
              e.stopPropagation();
              handleCopy();
            }}
            className={[
              'rounded p-1',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1',
              fg === 'white' ? 'hover:bg-white/15' : 'hover:bg-black/10',
            ].join(' ')}
          >
            <CopyIcon />
          </button>
          <a
            href={navHref}
            aria-label={`Open page for ${shade.hex}`}
            onClick={(e) => e.stopPropagation()}
            className={[
              'rounded p-1',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1',
              fg === 'white' ? 'hover:bg-white/15' : 'hover:bg-black/10',
            ].join(' ')}
          >
            <OpenIcon />
          </a>
        </div>
      </div>
    </div>
  );
}

function ContrastBadge({
  against,
  level,
  ratio,
  fg,
}: {
  against: 'white' | 'black';
  level: ReturnType<typeof wcagLevel>;
  ratio: number;
  fg: 'white' | 'black';
}) {
  const label = level === 'fail' ? '–' : level;
  const onColor = against === 'white' ? '#ffffff' : '#000000';
  return (
    <span
      title={`Contrast vs ${against}: ${ratio.toFixed(2)}:1 (${level})`}
      className={
        'inline-flex items-center gap-1 rounded px-1.5 py-0.5 ' +
        (fg === 'white' ? 'bg-white/10' : 'bg-black/10')
      }
    >
      <span
        aria-hidden="true"
        className="inline-block h-2 w-2 rounded-full"
        style={{ backgroundColor: onColor, outline: '1px solid currentColor' }}
      />
      <span className="tabular-nums">{label}</span>
    </span>
  );
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="h-4 w-4">
      <rect x="4" y="4" width="9" height="10" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3 11V3.5A1.5 1.5 0 0 1 4.5 2H11" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function OpenIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="h-4 w-4">
      <path d="M9.5 2.5h4v4M13 3L7 9" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      <path d="M12.5 9v3.5A1.5 1.5 0 0 1 11 14H3.5A1.5 1.5 0 0 1 2 12.5V5A1.5 1.5 0 0 1 3.5 3.5H7" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
    </svg>
  );
}
