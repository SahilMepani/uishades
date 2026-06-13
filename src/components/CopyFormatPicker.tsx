import type { CopyFormat, ExportFormat } from '../lib/color/types';
import { EXPORT_SUPPORTS_NON_HEX } from '../lib/exports/tokens';
import { SELECT_CLASS, SelectChevron } from './control-styles';

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
 * decoupled from the ramp/shade rows, which always render hex. Shares
 * `SELECT_CLASS` with the "Export" format picker so the two boxes are identical
 * in style and height.
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
    <span className="relative inline-flex">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as CopyFormat)}
        aria-label="Copy as"
        className={SELECT_CLASS}
      >
        {formats.map((k) => (
          <option key={k} value={k} disabled={nonHexDisabled && NON_HEX_FORMATS.has(k)}>
            {COPY_FORMAT_LABELS[k]}
          </option>
        ))}
      </select>
      <SelectChevron />
    </span>
  );
}
