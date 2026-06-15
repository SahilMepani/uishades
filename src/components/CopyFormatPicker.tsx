import type { CopyFormat, ExportFormat } from '../lib/color/types';
import { EXPORT_SUPPORTS_NON_HEX } from '../lib/exports/tokens';

/**
 * The "Copy as" picker offers the value formats the export can actually emit:
 * the CSS value modes hex / rgb() / hsl() / oklch() (`ValueMode`). The remaining
 * `CopyFormat` members (`cssVar`/`tailwindClass`) are inert here - selecting them
 * would still emit hex - and are deliberately omitted.
 */
const COPY_FORMAT_LABELS: Partial<Record<CopyFormat, string>> = {
  rgb: 'rgb()',
  hsl: 'hsl()',
  oklch: 'oklch()',
  hex: 'hex',
};

/** Formats that emit a non-hex value and so depend on `EXPORT_SUPPORTS_NON_HEX`. */
const NON_HEX_FORMATS = new Set<CopyFormat>(['rgb', 'hsl', 'oklch']);

/**
 * "Copy as" value-format picker. It now lives inside the export modal (see
 * `ExportModal`), under a visible "Copy as" eyebrow label, where it controls
 * only the *exported* code's value format (hex / rgb() / hsl() / oklch()) - it is
 * decoupled from the ramp/shade rows, which always render hex. Rendered as a
 * row of individual pill toggles matching the export-format picker above it.
 *
 * The non-hex options are greyed-out (rendered `disabled`) when the selected
 * `exportFormat` always emits hex - W3C Design Tokens / Figma Variables (see
 * `EXPORT_SUPPORTS_NON_HEX`) - so the options signal they have no effect on that
 * export rather than misleadingly looking selectable.
 */
export default function CopyFormatPicker({
  value,
  onChange,
  exportFormat,
}: {
  value: CopyFormat;
  onChange: (f: CopyFormat) => void;
  exportFormat: ExportFormat;
}) {
  const formats = Object.keys(COPY_FORMAT_LABELS) as CopyFormat[];
  const nonHexDisabled = !EXPORT_SUPPORTS_NON_HEX[exportFormat];

  return (
    <span role="tablist" aria-label="Copy as" className="flex flex-wrap gap-x-2.5 gap-y-2.5">
      {formats.map((k) => {
        const active = value === k;
        const disabled = nonHexDisabled && NON_HEX_FORMATS.has(k);
        return (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={disabled}
            onClick={() => onChange(k)}
            className={[
              'rounded-full px-3 py-1.5 font-mono text-[11px] font-medium uppercase tracking-tight',
              'ring-1 transition-colors duration-150 ease-out motion-reduce:transition-none',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60',
              disabled
                ? 'cursor-not-allowed text-ink/25 ring-ink/10'
                : active
                  ? 'bg-ink text-paper ring-ink shadow-sm'
                  : 'text-ink/70 ring-ink/15 hover:text-ink hover:ring-ink/30',
            ].join(' ')}
          >
            {COPY_FORMAT_LABELS[k]}
          </button>
        );
      })}
    </span>
  );
}
