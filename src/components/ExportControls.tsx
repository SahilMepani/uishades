import { lazy, Suspense, useCallback, useRef, useState } from 'react';
import type { CopyFormat, ExportFormat } from '../lib/color/types';
import type { ColorGroup } from '../lib/exports/tokens';

/**
 * The inline export control: a single clickable "Export" link that sits at the
 * far end of the metadata row (next to the PNG button). Clicking it opens the
 * export modal.
 *
 * The trigger itself is eager (one word, painted immediately), while the modal
 * - which owns the six export-format serializers, the heaviest leaf of the
 * island - is `React.lazy`-loaded on the first open. So the serializer chunk
 * downloads only when a user actually exports, never on the eager path.
 *
 * The "Copy as" value format lives here as *local* state, seeded once from the
 * shared copy format but never written back to it. That's deliberate: changing
 * "Copy as" in the modal re-serializes the exported code (hex ↔ oklch()) without
 * disturbing the hex values the ramp/shade rows display.
 *
 * The export emits hex / rgb() / hsl() / oklch() (see `ValueMode`), so the
 * modal's "Copy as" picker offers exactly those. We normalize the seed
 * accordingly: a persisted `cssVar`/`tailwindClass` preference (which the picker
 * doesn't list) collapses to `hex` rather than leaving the `<select>` holding a
 * value it can't show.
 */

const ExportModal = lazy(() => import('./ExportModal'));

export interface ExportControlsProps {
  /**
   * One group per color family. A single-color view passes one group; once the
   * palette tray holds two or more colors every swatch is its own group, so the
   * export emits the whole palette - not just the active color.
   */
  groups: ColorGroup[];
  format: ExportFormat;
  /** Seeds the modal-local "Copy as" value format (see file note). */
  copyFormat: CopyFormat;
  onFormatChange: (next: ExportFormat) => void;
}

export default function ExportControls({
  groups,
  format,
  copyFormat,
  onFormatChange,
}: ExportControlsProps) {
  const [open, setOpen] = useState(false);
  // Local to the export modal - decoupled from the shared copy format the
  // ramp/shade rows render. Seeded once from it so a returning visitor's
  // preference is the starting point, then owned here for the session. The
  // picker lists hex/rgb()/hsl()/oklch(), so collapse any other persisted format
  // (cssVar/tailwindClass) to hex.
  const [exportCopyFormat, setExportCopyFormat] = useState<CopyFormat>(
    copyFormat === 'rgb' || copyFormat === 'hsl' || copyFormat === 'oklch'
      ? copyFormat
      : 'hex',
  );
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  // Stable identity so ExportModal's mount-only effects don't re-run.
  const close = useCallback(() => setOpen(false), []);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Open export options"
        className={EXPORT_TRIGGER_CLASS}
      >
        Export
      </button>
      {open && (
        <Suspense fallback={null}>
          <ExportModal
            groups={groups}
            format={format}
            copyFormat={exportCopyFormat}
            onFormatChange={onFormatChange}
            onCopyFormatChange={setExportCopyFormat}
            onClose={close}
            triggerRef={triggerRef}
          />
        </Suspense>
      )}
    </>
  );
}

const EXPORT_TRIGGER_CLASS =
  'font-mono text-[11px] uppercase tracking-[0.16em] text-ink ' +
  'underline decoration-ink/30 underline-offset-4 ' +
  'transition-colors duration-150 ease-out hover:text-accent hover:decoration-accent ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60';
