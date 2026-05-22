import { useEffect, useMemo, useState } from 'react';
import type { ExportFormat, TailwindScale } from '../lib/color/types';
import { toTailwindV4 } from '../lib/exports/tailwind-v4';
import { toTailwindV3 } from '../lib/exports/tailwind-v3';
import { toCssVars } from '../lib/exports/css-vars';
import { toW3CTokens } from '../lib/exports/w3c-tokens';
import { toFigmaVars } from '../lib/exports/figma-vars';
import { useToast } from './Toast';

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

  const { pushToast } = useToast();

  // Feature-detect clipboard availability after hydration. Default true so
  // SSR + first paint match; flip to false when missing so we can disable
  // the Copy button instead of presenting an action that does nothing.
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

  const handleCopy = () => {
    if (
      typeof navigator === 'undefined' ||
      !navigator.clipboard ||
      typeof navigator.clipboard.writeText !== 'function'
    ) {
      pushToast("Couldn't copy — clipboard is unavailable in this browser.");
      return;
    }
    navigator.clipboard.writeText(text).then(
      () => {
        pushToast(`Copied ${format} export`);
        onCopy(text);
      },
      () => {
        pushToast("Couldn't copy — check browser permissions.");
      },
    );
  };

  return (
    <div className="flex flex-col gap-3" data-export-format={format}>
      <div className="flex items-center justify-between gap-3">
        <label className="flex items-center gap-3 text-sm text-ink/80">
          <span className="eyebrow">Export as</span>
          <select
            value={format}
            onChange={(e) => onFormatChange(e.target.value as ExportFormat)}
            aria-label="Export as"
            className={
              'border border-ink/20 bg-paper px-2 py-1 font-mono text-xs text-ink ' +
              'focus-visible:outline-none focus-visible:border-accent'
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
        {canCopy && (
          <button
            type="button"
            onClick={handleCopy}
            className={
              'absolute right-3 top-3 z-10 bg-ink px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.16em] text-paper ' +
              'hover:bg-accent ' +
              'focus-visible:outline-none focus-visible:bg-accent'
            }
            aria-label="Copy export to clipboard"
          >
            Copy
          </button>
        )}
        <pre
          data-export-preview="true"
          className={
            'max-h-[200px] overflow-auto bg-paper-2 p-4 pr-20 font-mono text-[12px] ' +
            'leading-relaxed text-ink-2 border border-hairline'
          }
        >
          {text}
        </pre>
      </div>
    </div>
  );
}
