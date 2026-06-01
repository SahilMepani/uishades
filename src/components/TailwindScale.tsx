import { lazy, Suspense } from 'react';
import type {
  CopyFormat,
  ExportFormat,
  Hex,
  TailwindScale as TailwindScaleData,
} from '../lib/color/types';
import { scaleToTokens } from '../lib/exports/tokens';
import ShadeRow from './ShadeRow';

// The export-dropdown UI plus its five export-format serializers are the
// heaviest leaf of the React island. Now that the Tailwind scale is the
// default view, its grid is shipped eagerly and server-rendered - but the
// export panel stays split into its own chunk and loads after hydration
// behind the small, height-stable fallback below. Keeping the boundary here
// (rather than around all of `TailwindScale`) means the SSR'd HTML carries
// the real 11-stop scale as crawlable content, not a skeleton.
const ExportDropdown = lazy(() => import('./ExportDropdown'));

/**
 * Renders the 11-stop Tailwind scale and the export dropdown that sits
 * atop it. The anchor-stop row carries the `isInput` flag from the
 * builder so the `<ShadeRow>` displays the "input" badge + ring.
 */

export interface TailwindScaleProps {
  scale: TailwindScaleData;
  /** Pinned source hex - every non-anchor row renders this in a 20% band. */
  sourceHex: Hex;
  copyFormat: CopyFormat;
  exportFormat: ExportFormat;
  brandName?: string;
  onCopy: (hex: Hex) => void;
  onNavigate: (hex: Hex) => void;
  onExportCopy: (text: string) => void;
  onExportFormatChange: (next: ExportFormat) => void;
  onCopyFormatChange: (next: CopyFormat) => void;
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
  onCopyFormatChange,
}: TailwindScaleProps) {
  return (
    <div className="flex flex-col gap-4" data-anchor-stop={scale.anchorStop}>
      <Suspense fallback={<ExportDropdownFallback />}>
        <ExportDropdown
          tokens={scaleToTokens(scale)}
          format={exportFormat}
          brandName={brandName}
          valueMode="hex"
          copyFormat={copyFormat}
          hasStop={true}
          onCopyFormatChange={onCopyFormatChange}
          onFormatChange={onExportFormatChange}
          onCopy={onExportCopy}
        />
      </Suspense>
      <div
        role="list"
        aria-label="Tailwind 11-stop scale"
        className="flex w-full flex-col gap-[2px] border-b border-ink/15"
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

/**
 * Height-stable placeholder for the lazy `ExportDropdown` chunk. Reserves
 * roughly the height of the real "Export as" controls row (a label + select
 * and two icon buttons) so the scale grid below it doesn't jump when the
 * chunk arrives. Much shorter than the old whole-view fallback because the
 * grid itself now renders eagerly.
 */
function ExportDropdownFallback() {
  return (
    <div aria-hidden="true" className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <div className="h-7 w-40 bg-paper-2 motion-safe:animate-pulse" />
        <div className="h-7 w-7 bg-paper-2 motion-safe:animate-pulse" />
        <div className="h-7 w-7 bg-paper-2 motion-safe:animate-pulse" />
      </div>
      <div className="h-7 w-24 bg-paper-2 motion-safe:animate-pulse" />
    </div>
  );
}
