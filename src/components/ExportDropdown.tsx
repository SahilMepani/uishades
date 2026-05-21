import { useMemo } from 'react';
import type { ExportFormat, TailwindScale } from '../lib/color/types';
import { toTailwindV4 } from '../lib/exports/tailwind-v4';
import { toTailwindV3 } from '../lib/exports/tailwind-v3';
import { toCssVars } from '../lib/exports/css-vars';
import { toW3CTokens } from '../lib/exports/w3c-tokens';
import { toFigmaVars } from '../lib/exports/figma-vars';

/**
 * Five-format export dropdown for the Tailwind scale view.
 *
 * The component is dumb: it picks the right serializer for the current
 * `format`, renders the result in a `<pre>`, and exposes a copy button
 * that hands the text up to the parent (so the parent can fire the
 * toast through the shared toast context).
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

export default function ExportDropdown({
  scale,
  format,
  brandName,
  onFormatChange,
  onCopy,
}: ExportDropdownProps) {
  const name = (brandName || 'brand').trim() || 'brand';
  const text = useMemo(() => serialize(scale, format, name), [scale, format, name]);

  const handleCopy = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text).catch(() => {
        /* noop */
      });
    }
    onCopy(text);
  };

  return (
    <div className="flex flex-col gap-2" data-export-format={format}>
      <div className="flex items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-200">
          <span>Export as</span>
          <select
            value={format}
            onChange={(e) => onFormatChange(e.target.value as ExportFormat)}
            className={
              'rounded-md bg-white px-2 py-1 text-sm ring-1 ring-neutral-300 ' +
              'dark:bg-neutral-900 dark:ring-neutral-700 ' +
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500'
            }
          >
            {FORMAT_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="relative">
        <button
          type="button"
          onClick={handleCopy}
          className={
            'absolute right-2 top-2 rounded bg-neutral-900 px-2 py-1 text-xs font-medium text-white ' +
            'hover:bg-neutral-800 ' +
            'dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200 ' +
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500'
          }
          aria-label="Copy export to clipboard"
        >
          Copy
        </button>
        <pre
          data-export-preview="true"
          className={
            'max-h-72 overflow-auto rounded-md bg-neutral-50 p-3 pr-16 font-mono text-xs ' +
            'leading-snug text-neutral-800 ring-1 ring-neutral-200 ' +
            'dark:bg-neutral-950 dark:text-neutral-100 dark:ring-neutral-800'
          }
        >
          {text}
        </pre>
      </div>
    </div>
  );
}
