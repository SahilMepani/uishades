import { lazy, Suspense } from 'react';
import type {
  ContinuousRamp as ContinuousRampData,
  CopyFormat,
  ExportFormat,
  Hex,
} from '../lib/color/types';
import type { ValueMode } from '../lib/exports/tokens';
import { rampToTokens } from '../lib/exports/tokens';
import ShadeRow from './ShadeRow';

/**
 * Renders a `ContinuousRamp` (OKLCH 20-step ramp) as a stack of `<ShadeRow>`
 * entries, with the shared export dropdown atop it. The export panel (the
 * dropdown UI + the five serializers) is the heaviest leaf of the island, so
 * it loads behind the same `React.lazy` boundary `TailwindScale` uses - both
 * views resolve the same chunk, so it downloads once.
 *
 * Ramp tokens are keyed by 1-based step index (1..20), and the hex/oklch()
 * value toggle is shown here (it is hidden in the Tailwind view). The ramp
 * data carries its mode in `ramp.mode` (always `oklch` now that the classic
 * walk is no longer surfaced); we keep it as a data attribute for tests.
 */

const ExportDropdown = lazy(() => import('./ExportDropdown'));

export interface ContinuousRampProps {
  ramp: ContinuousRampData;
  /** Pinned source hex - every non-source row renders this in a 20% band. */
  sourceHex: Hex;
  copyFormat: CopyFormat;
  exportFormat: ExportFormat;
  valueMode: ValueMode;
  brandName?: string;
  onCopy: (hex: Hex) => void;
  onNavigate: (hex: Hex) => void;
  onExportCopy: (text: string) => void;
  onExportFormatChange: (next: ExportFormat) => void;
  onValueModeChange: (m: ValueMode) => void;
}

export default function ContinuousRamp({
  ramp,
  sourceHex,
  copyFormat,
  exportFormat,
  valueMode,
  brandName,
  onCopy,
  onNavigate,
  onExportCopy,
  onExportFormatChange,
  onValueModeChange,
}: ContinuousRampProps) {
  return (
    <div className="flex flex-col gap-4">
      <Suspense fallback={<ExportDropdownFallback />}>
        <ExportDropdown
          tokens={rampToTokens(ramp)}
          format={exportFormat}
          brandName={brandName}
          valueMode={valueMode}
          onValueModeChange={onValueModeChange}
          showValueToggle={true}
          onFormatChange={onExportFormatChange}
          onCopy={onExportCopy}
        />
      </Suspense>
      <div
        data-ramp-mode={ramp.mode}
        data-shade-count={ramp.shades.length}
        role="list"
        aria-label="OKLCH ramp"
        className="flex w-full flex-col gap-[2px] border-b border-ink/15"
      >
        {ramp.shades.map((shade, i) => (
          <div role="listitem" key={`${shade.hex}-${i}`}>
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
 * Height-stable placeholder for the lazy `ExportDropdown` chunk - mirrors the
 * one in `TailwindScale` so the ramp rows don't jump when the chunk arrives.
 */
function ExportDropdownFallback() {
  return (
    <div aria-hidden="true" className="flex items-center gap-3">
      <div className="h-7 w-40 bg-paper-2 motion-safe:animate-pulse" />
      <div className="h-7 w-7 bg-paper-2 motion-safe:animate-pulse" />
      <div className="h-7 w-7 bg-paper-2 motion-safe:animate-pulse" />
    </div>
  );
}
