import type {
  CopyFormat,
  ExportFormat,
  Hex,
  TailwindScale as TailwindScaleData,
} from '../lib/color/types';
import ShadeRow from './ShadeRow';
import ExportDropdown from './ExportDropdown';

/**
 * Renders the 11-stop Tailwind scale and the export dropdown that sits
 * atop it. The anchor-stop row carries the `isInput` flag from the
 * builder so the `<ShadeRow>` displays the "input" badge + ring.
 */

export interface TailwindScaleProps {
  scale: TailwindScaleData;
  /** Pinned source hex — every non-anchor row renders this in a 20% band. */
  sourceHex: Hex;
  copyFormat: CopyFormat;
  exportFormat: ExportFormat;
  brandName?: string;
  onCopy: (hex: Hex) => void;
  onNavigate: (hex: Hex) => void;
  onExportCopy: (text: string) => void;
  onExportFormatChange: (next: ExportFormat) => void;
}

export default function TailwindScale({
  scale,
  sourceHex,
  copyFormat,
  exportFormat,
  brandName,
  onCopy,
  onNavigate,
  onExportCopy,
  onExportFormatChange,
}: TailwindScaleProps) {
  return (
    <div className="flex flex-col gap-4" data-anchor-stop={scale.anchorStop}>
      <ExportDropdown
        scale={scale}
        format={exportFormat}
        brandName={brandName}
        onFormatChange={onExportFormatChange}
        onCopy={onExportCopy}
      />
      <div
        role="list"
        aria-label="Tailwind 11-stop scale"
        className="flex w-full flex-col border-b border-ink/15"
      >
        {scale.shades.map((shade) => (
          <div role="listitem" key={shade.stop}>
            <ShadeRow
              shade={shade}
              sourceHex={sourceHex}
              copyFormat={copyFormat}
              brandName={brandName}
              onCopy={onCopy}
              onNavigate={onNavigate}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
