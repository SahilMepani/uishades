import type { CopyFormat, ExportFormat } from '../lib/color/types';
import { EXPORT_SUPPORTS_OKLCH } from '../lib/exports/tokens';
import { SELECT_CLASS, SelectChevron } from './control-styles';

const COPY_FORMAT_LABELS: Record<CopyFormat, string> = {
  hex: 'hex',
  oklch: 'oklch()',
  rgb: 'rgb()',
  hsl: 'hsl()',
  cssVar: 'var(--name)',
  tailwindClass: 'bg-name-500',
};

/**
 * "Copy as" value-format picker - controls how each shade row serializes its
 * color when copied. It rides at the far right of the export-controls row
 * (see `ExportDropdown`) with no visible label: the option values (hex,
 * oklch(), rgb(), ...) are self-describing, and the accessible name stays
 * "Copy as". Shares `SELECT_CLASS` with the "Export" picker so the two boxes
 * are identical in style and height.
 *
 * `cssVar`/`tailwindClass` require a stop number, so they only appear when
 * `hasStop` is true (the Tailwind-scale view).
 *
 * `oklch()` is greyed-out (rendered `disabled`) when the selected `exportFormat`
 * always emits hex - W3C Design Tokens / Figma Variables (see
 * `EXPORT_SUPPORTS_OKLCH`) - so the option signals it has no effect on that
 * export rather than misleadingly looking selectable.
 */
export default function CopyFormatPicker({
  value,
  onChange,
  hasStop,
  exportFormat,
}: {
  value: CopyFormat;
  onChange: (f: CopyFormat) => void;
  hasStop: boolean;
  exportFormat: ExportFormat;
}) {
  const formats = (Object.keys(COPY_FORMAT_LABELS) as CopyFormat[]).filter((k) => {
    const requiresStop = k === 'cssVar' || k === 'tailwindClass';
    return !(requiresStop && !hasStop);
  });
  const oklchDisabled = !EXPORT_SUPPORTS_OKLCH[exportFormat];

  return (
    <span className="relative inline-flex">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as CopyFormat)}
        aria-label="Copy as"
        className={SELECT_CLASS}
      >
        {formats.map((k) => (
          <option key={k} value={k} disabled={k === 'oklch' && oklchDisabled}>
            {COPY_FORMAT_LABELS[k]}
          </option>
        ))}
      </select>
      <SelectChevron />
    </span>
  );
}
