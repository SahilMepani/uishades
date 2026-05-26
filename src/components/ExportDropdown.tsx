import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ExportFormat, TailwindScale } from '../lib/color/types';
import { toTailwindV4 } from '../lib/exports/tailwind-v4';
import { toTailwindV3 } from '../lib/exports/tailwind-v3';
import { toCssVars } from '../lib/exports/css-vars';
import { toW3CTokens } from '../lib/exports/w3c-tokens';
import { toFigmaVars } from '../lib/exports/figma-vars';
import { useToast } from './Toast';

/**
 * Export controls for the Tailwind scale view.
 *
 * The inline UI is now just the "Export as" dropdown plus two icon buttons:
 *   - Copy — writes the currently-selected format's code straight to the
 *     clipboard (no popup).
 *   - View — opens a modal that shows every format as a tab, with the code
 *     for the active tab and its own Copy button.
 *
 * Moving the code preview into the modal keeps the inline layout short so the
 * scale rows sit directly under the controls instead of being pushed down by
 * a tall `<pre>`. The dropdown is the single source of truth for the selected
 * format — the modal's tabs drive the same `onFormatChange`, so browsing a
 * tab updates the dropdown (and the persisted preference) too.
 */

export interface ExportDropdownProps {
  scale: TailwindScale;
  format: ExportFormat;
  brandName?: string;
  onFormatChange: (next: ExportFormat) => void;
  onCopy: (text: string) => void;
}

const FORMAT_OPTIONS: { value: ExportFormat; label: string }[] = [
  { value: 'tailwind-v4', label: 'Tailwind v4 (@theme)' },
  { value: 'tailwind-v3', label: 'Tailwind v3 (config)' },
  { value: 'css-vars', label: 'CSS variables' },
  { value: 'w3c-tokens', label: 'W3C Design Tokens' },
  { value: 'figma-vars', label: 'Figma Variables' },
];

function serialize(scale: TailwindScale, format: ExportFormat, name: string): string {
  switch (format) {
    case 'tailwind-v4':
      return toTailwindV4(scale, name);
    case 'tailwind-v3':
      return toTailwindV3(scale, name);
    case 'css-vars':
      return toCssVars(scale, name);
    case 'w3c-tokens':
      return toW3CTokens(scale, name);
    case 'figma-vars':
      return toFigmaVars(scale, name);
  }
}

function clipboardAvailable(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    !!navigator.clipboard &&
    typeof navigator.clipboard.writeText === 'function'
  );
}

export default function ExportDropdown({
  scale,
  format,
  brandName,
  onFormatChange,
  onCopy,
}: ExportDropdownProps) {
  const name = (brandName || 'brand').trim() || 'brand';
  const text = useMemo(() => serialize(scale, format, name), [scale, format, name]);

  const { pushToast } = useToast();

  // Feature-detect clipboard availability after hydration. Default true so
  // SSR + first paint match; flip to false when missing so we can hide the
  // Copy actions instead of presenting buttons that do nothing.
  const [canCopy, setCanCopy] = useState(true);
  useEffect(() => {
    if (!clipboardAvailable()) setCanCopy(false);
  }, []);

  const copyText = useCallback(
    (value: string, label: ExportFormat) => {
      if (!clipboardAvailable()) {
        pushToast("Couldn't copy — clipboard is unavailable in this browser.");
        return;
      }
      navigator.clipboard.writeText(value).then(
        () => {
          pushToast(`Copied ${label} export`);
          onCopy(value);
        },
        () => {
          pushToast("Couldn't copy — check browser permissions.");
        },
      );
    },
    [pushToast, onCopy],
  );

  const [modalOpen, setModalOpen] = useState(false);
  const viewTriggerRef = useRef<HTMLButtonElement | null>(null);
  // Stable identity so ExportModal's effects don't re-run (and eject focus)
  // every time the parent re-renders — e.g. when switching format tabs.
  const closeModal = useCallback(() => setModalOpen(false), []);

  return (
    <div className="flex flex-col gap-3" data-export-format={format}>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-3 text-sm text-ink/80">
          <span className="eyebrow">Export as</span>
          {/* `appearance-none` + overlaid chevron, matching the "Copy as"
              picker. Accent border/ring is focus-visible only; hover just
              warms the background. */}
          <span className="relative inline-flex">
            <select
              value={format}
              onChange={(e) => onFormatChange(e.target.value as ExportFormat)}
              aria-label="Export as"
              className={
                'appearance-none border border-ink/20 bg-paper-2 py-1 pl-2 pr-7 font-mono text-xs text-ink ' +
                'transition-colors duration-150 ease-out motion-reduce:transition-none ' +
                'focus-visible:outline-none focus-visible:border-accent ' +
                'focus-visible:ring-2 focus-visible:ring-accent/30'
              }
            >
              {FORMAT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <svg
              aria-hidden="true"
              viewBox="0 0 16 16"
              className="pointer-events-none absolute right-2 top-1/2 h-[1.05rem] w-[1.05rem] -translate-y-1/2 text-mute"
            >
              <path d="M4 6.5 8 10.5l4-4" fill="none" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </span>
        </label>

        <div className="flex items-center gap-2">
          {canCopy && (
            <button
              type="button"
              onClick={() => copyText(text, format)}
              aria-label={`Copy ${format} export to clipboard`}
              title="Copy code"
              className={ICON_BUTTON_CLASS}
            >
              <CopyIcon className="h-4 w-4" />
            </button>
          )}
          <button
            ref={viewTriggerRef}
            type="button"
            onClick={() => setModalOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={modalOpen}
            aria-label="View export code for all formats"
            title="View code"
            className={ICON_BUTTON_CLASS}
          >
            <EyeIcon className="h-4 w-4" />
          </button>
        </div>
      </div>

      {modalOpen && (
        <ExportModal
          scale={scale}
          name={name}
          format={format}
          canCopy={canCopy}
          onFormatChange={onFormatChange}
          onCopy={copyText}
          onClose={closeModal}
          triggerRef={viewTriggerRef}
        />
      )}
    </div>
  );
}

const ICON_BUTTON_CLASS =
  'inline-flex h-7 w-7 shrink-0 items-center justify-center text-mute ' +
  'transition-colors duration-150 ease-out hover:bg-paper-2 hover:text-ink ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60';

function ExportModal({
  scale,
  name,
  format,
  canCopy,
  onFormatChange,
  onCopy,
  onClose,
  triggerRef,
}: {
  scale: TailwindScale;
  name: string;
  format: ExportFormat;
  canCopy: boolean;
  onFormatChange: (next: ExportFormat) => void;
  onCopy: (value: string, label: ExportFormat) => void;
  onClose: () => void;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const text = useMemo(() => serialize(scale, format, name), [scale, format, name]);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const titleId = 'export-modal-title';

  // Escape-to-close. Kept separate from the focus/scroll management below so
  // that if `onClose`'s identity ever changes, only this cheap listener
  // re-subscribes — focus is never disturbed.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Body-scroll lock + focus management — strictly mount/unmount (triggerRef is
  // stable). This must NOT depend on changing props (format, onClose, …): a
  // re-render such as switching format tabs would otherwise run the cleanup
  // and eject focus out of the open dialog onto the trigger button behind it.
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const trigger = triggerRef.current;
    // Move focus into the dialog so keyboard users land inside it.
    dialogRef.current?.focus();
    return () => {
      document.body.style.overflow = prevOverflow;
      trigger?.focus();
    };
  }, [triggerRef]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        aria-hidden="true"
        onClick={onClose}
        className="absolute inset-0 bg-black/40 backdrop-blur-[1px]"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={
          'relative z-10 flex max-h-[85vh] w-full max-w-2xl flex-col border border-hairline bg-paper ' +
          'shadow-[0_24px_64px_rgba(17,17,16,0.28)] focus:outline-none'
        }
      >
        <div className="flex items-center justify-between gap-3 border-b border-hairline px-5 py-3.5">
          <h2 id={titleId} className="font-display text-base text-ink">
            Export <span className="font-mono text-mute">{name}</span> scale
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close export dialog"
            className={
              'inline-flex h-7 w-7 shrink-0 items-center justify-center text-mute ' +
              'transition-colors duration-150 ease-out hover:text-ink ' +
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60'
            }
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
        </div>

        <div
          role="tablist"
          aria-label="Export format"
          className="flex flex-wrap gap-1 border-b border-hairline px-3 py-2"
        >
          {FORMAT_OPTIONS.map((opt) => {
            const active = opt.value === format;
            return (
              <button
                key={opt.value}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onFormatChange(opt.value)}
                className={[
                  'rounded-sm px-2.5 py-1.5 font-mono text-xs tracking-tight whitespace-nowrap',
                  'transition-colors duration-150 ease-out motion-reduce:transition-none',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60',
                  active ? 'bg-ink text-paper' : 'text-ink/70 hover:bg-paper-2 hover:text-ink',
                ].join(' ')}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        <div className="relative min-h-0 flex-1">
          {canCopy && (
            <button
              type="button"
              onClick={() => onCopy(text, format)}
              className={
                'absolute right-4 top-4 z-10 bg-ink px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.16em] text-paper ' +
                'transition-colors duration-200 ease-out hover:bg-accent ' +
                'focus-visible:outline-none focus-visible:bg-accent'
              }
              aria-label={`Copy ${format} export to clipboard`}
            >
              Copy
            </button>
          )}
          <pre
            data-export-preview="true"
            className={
              'h-full max-h-[60vh] overflow-auto bg-paper-2 p-5 pr-20 font-mono text-[12px] ' +
              'leading-relaxed text-ink-2'
            }
          >
            {text}
          </pre>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function CopyIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className={className ?? 'h-4 w-4'}>
      <rect x="4" y="4" width="9" height="10" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3 11V3.5A1.5 1.5 0 0 1 4.5 2H11" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function EyeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className={className ?? 'h-4 w-4'}>
      <path
        d="M1 8s2.6-4.5 7-4.5S15 8 15 8s-2.6 4.5-7 4.5S1 8 1 8Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <circle cx="8" cy="8" r="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
