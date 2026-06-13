import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CopyFormat, ExportFormat } from '../lib/color/types';
import type { ColorGroup, ValueMode } from '../lib/exports/tokens';
import CopyFormatPicker from './CopyFormatPicker';
import { SELECT_CLASS, SelectChevron } from './control-styles';
import { toTailwindV4 } from '../lib/exports/tailwind-v4';
import { toTailwindV3 } from '../lib/exports/tailwind-v3';
import { toCssVars } from '../lib/exports/css-vars';
import { toW3CTokens } from '../lib/exports/w3c-tokens';
import { toFigmaVars } from '../lib/exports/figma-vars';
import { toStyleDictionary } from '../lib/exports/style-dictionary';
import { useToast } from './Toast';

/**
 * The export modal - the only export surface now that the inline row is just a
 * clickable "Export" trigger (see `ExportControls`). It carries the "Export"
 * format `<select>`, the "Copy as" value-format picker, a live code preview,
 * and its own Copy button.
 *
 * This module owns the six export-format serializers, so it (plus them) is the
 * heaviest leaf of the React island and is loaded lazily from `ExportControls`
 * on the first open - it never touches the eager path.
 *
 * **The "Copy as" picker here is intentionally local to the export.** Its state
 * lives in `ExportControls`, decoupled from the shared copy format the
 * ramp/shade rows display: switching it to oklch() emits oklch() values in the
 * exported code *without* re-rendering the ramp's hex labels. Only the export's
 * hex-vs-oklch() value mode follows it (the JSON exports - W3C/Figma - ignore
 * it and always emit hex; see their serializers).
 */

const FORMAT_OPTIONS: { value: ExportFormat; label: string }[] = [
  { value: 'tailwind-v4', label: 'Tailwind v4 (@theme)' },
  { value: 'tailwind-v3', label: 'Tailwind v3 (config)' },
  { value: 'css-vars', label: 'CSS variables' },
  { value: 'w3c-tokens', label: 'W3C Design Tokens' },
  { value: 'figma-vars', label: 'Figma Variables' },
  { value: 'style-dictionary', label: 'Style Dictionary' },
];

function serialize(
  groups: ColorGroup[],
  format: ExportFormat,
  valueMode: ValueMode,
): string {
  switch (format) {
    case 'tailwind-v4':
      return toTailwindV4(groups, valueMode);
    case 'tailwind-v3':
      return toTailwindV3(groups, valueMode);
    case 'css-vars':
      return toCssVars(groups, valueMode);
    case 'w3c-tokens':
      return toW3CTokens(groups, valueMode);
    case 'figma-vars':
      return toFigmaVars(groups, valueMode);
    case 'style-dictionary':
      return toStyleDictionary(groups, valueMode);
  }
}

function clipboardAvailable(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    !!navigator.clipboard &&
    typeof navigator.clipboard.writeText === 'function'
  );
}

export interface ExportModalProps {
  /**
   * One group per color family. A single-color view passes one group; once the
   * palette tray holds two or more colors every swatch is its own group, so the
   * export emits the whole palette - not just the active color.
   */
  groups: ColorGroup[];
  format: ExportFormat;
  /**
   * Local "Copy as" value-format state (lives in `ExportControls`). Drives the
   * emitted code's hex-vs-oklch() values only - never the ramp/shade rows.
   */
  copyFormat: CopyFormat;
  onFormatChange: (next: ExportFormat) => void;
  onCopyFormatChange: (next: CopyFormat) => void;
  onClose: () => void;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
}

export default function ExportModal({
  groups,
  format,
  copyFormat,
  onFormatChange,
  onCopyFormatChange,
  onClose,
  triggerRef,
}: ExportModalProps) {
  // Export value format follows the modal-local "Copy as" picker: rgb()/hsl()/
  // oklch() when one is selected, else hex. (W3C/Figma JSON exports ignore it.)
  const valueMode: ValueMode =
    copyFormat === 'rgb' || copyFormat === 'hsl' || copyFormat === 'oklch'
      ? copyFormat
      : 'hex';
  const text = useMemo(
    () => serialize(groups, format, valueMode),
    [groups, format, valueMode],
  );

  const { pushToast } = useToast();

  // Feature-detect clipboard availability after hydration. Default true so the
  // first paint matches; flip false when missing so we hide the Copy button
  // instead of presenting one that does nothing.
  const [canCopy, setCanCopy] = useState(true);
  useEffect(() => {
    if (!clipboardAvailable()) setCanCopy(false);
  }, []);

  const copyText = useCallback(() => {
    if (!clipboardAvailable()) {
      pushToast("Couldn't copy - clipboard is unavailable in this browser.");
      return;
    }
    navigator.clipboard.writeText(text).then(
      () => pushToast(`Copied ${format} export`),
      () => pushToast("Couldn't copy - check browser permissions."),
    );
  }, [text, format, pushToast]);

  const dialogRef = useRef<HTMLDivElement | null>(null);
  const titleId = 'export-modal-title';

  // Escape-to-close. Kept separate from the focus/scroll management below so
  // that if `onClose`'s identity ever changes, only this cheap listener
  // re-subscribes - focus is never disturbed.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Body-scroll lock + focus management - strictly mount/unmount (triggerRef is
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
          // Fixed height (not max-h) so the centered dialog stays put when the
          // active tab's code is shorter or longer - short formats get
          // whitespace, tall ones (the JSON exports) scroll inside the <pre>.
          'relative z-10 flex h-[75vh] w-full max-w-2xl flex-col border border-hairline bg-paper ' +
          'shadow-[0_24px_64px_rgba(17,17,16,0.28)] focus:outline-none'
        }
      >
        <div className="flex items-center justify-between gap-3 border-b border-hairline px-5 py-3.5">
          <h2 id={titleId} className="font-display text-base text-ink">
            {groups.length === 1 ? (
              <>
                Export <span className="font-mono text-mute">{groups[0].name}</span> scale
              </>
            ) : (
              <>
                Export palette{' '}
                <span className="font-mono text-mute">({groups.length} colors)</span>
              </>
            )}
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

        {/* The "Export" format picker plus the modal-local "Copy as" value-format
            picker (which greys out oklch() for formats that only emit hex). The
            "Copy as" choice drives only the emitted code below - it does not
            touch the shared copy format the ramp/shade rows render. */}
        <div className="flex flex-wrap items-center gap-3 border-b border-hairline px-5 py-3">
          <label className="flex items-center gap-3 text-sm text-ink/80">
            <span className="eyebrow">Export</span>
            <span className="relative inline-flex">
              <select
                value={format}
                onChange={(e) => onFormatChange(e.target.value as ExportFormat)}
                aria-label="Export as"
                className={SELECT_CLASS}
              >
                {FORMAT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <SelectChevron />
            </span>
          </label>

          <label className="flex items-center gap-3 text-sm text-ink/80">
            <span className="eyebrow">Copy as</span>
            <CopyFormatPicker
              value={copyFormat}
              onChange={onCopyFormatChange}
              exportFormat={format}
            />
          </label>
        </div>

        <div className="relative min-h-0 flex-1">
          {canCopy && (
            <button
              type="button"
              onClick={copyText}
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
              'h-full overflow-auto bg-paper-2 p-5 pr-20 font-mono text-[12px] ' +
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
