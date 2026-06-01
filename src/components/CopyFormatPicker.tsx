import type { CopyFormat } from '../lib/color/types';
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
 */
export default function CopyFormatPicker({
  value,
  onChange,
  hasStop,
}: {
  value: CopyFormat;
  onChange: (f: CopyFormat) => void;
  hasStop: boolean;
}) {
  const formats = (Object.keys(COPY_FORMAT_LABELS) as CopyFormat[]).filter((k) => {
    const requiresStop = k === 'cssVar' || k === 'tailwindClass';
    return !(requiresStop && !hasStop);
  });

  return (
    <span className="relative inline-flex">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as CopyFormat)}
        aria-label="Copy as"
        className={SELECT_CLASS}
      >
        {formats.map((k) => (
          <option key={k} value={k}>
            {COPY_FORMAT_LABELS[k]}
          </option>
        ))}
      </select>
      <SelectChevron />
    </span>
  );
}
