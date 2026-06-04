import { lazy, Suspense, useMemo } from 'react';
import type {
  ContinuousRamp as ContinuousRampData,
  CopyFormat,
  ExportFormat,
  Hex,
} from '../lib/color/types';
import type { ColorGroup, ValueMode } from '../lib/exports/tokens';
import { rampToTokens, dedupeGroupNames } from '../lib/exports/tokens';
import { oklchRamp } from '../lib/color/ramp';
import ShadeRow from './ShadeRow';
import PaletteShadeGrid from './PaletteShadeGrid';

/**
 * Renders a `ContinuousRamp` (OKLCH 20-step ramp) as a stack of `<ShadeRow>`
 * entries, with the shared export dropdown atop it. The export panel (the
 * dropdown UI + the five serializers) is the heaviest leaf of the island, so
 * it loads behind the same `React.lazy` boundary `TailwindScale` uses - both
 * views resolve the same chunk, so it downloads once.
 *
 * Ramp tokens are keyed by 1-based step index (1..20). The export value format
 * (hex vs oklch()) is derived upstream from the shared "Copy as" picker and
 * passed down as `valueMode` - there is no separate value control. The ramp
 * data carries its mode in `ramp.mode` (always `oklch` now that the classic
 * walk is no longer surfaced); we keep it as a data attribute for tests.
 */

const ExportDropdown = lazy(() => import('./ExportDropdown'));

export interface ContinuousRampProps {
  ramp: ContinuousRampData;
  /** Pinned source hex - every non-source row renders this in a 20% band. */
  sourceHex: Hex;
  /**
   * Palette tray colors (in tray order). When two or more are present the
   * single ramp is replaced by a column-per-color grid that lines up with the
   * `PalettePreviewBar` band above; the export controls stay put but now emit
   * every color, not just the active one.
   */
  paletteHexes?: Hex[];
  /**
   * Brand name per palette color, parallel to `paletteHexes` (nearest-named
   * slug). Names each color's export group and its per-column copy labels.
   * Falls back to `brandName` / `'brand'` when absent.
   */
  paletteNames?: string[];
  copyFormat: CopyFormat;
  exportFormat: ExportFormat;
  valueMode: ValueMode;
  brandName?: string;
  onCopy: (hex: Hex) => void;
  onNavigate: (hex: Hex) => void;
  onExportCopy: (text: string) => void;
  onExportFormatChange: (next: ExportFormat) => void;
  onCopyFormatChange: (next: CopyFormat) => void;
}

export default function ContinuousRamp({
  ramp,
  sourceHex,
  paletteHexes,
  paletteNames,
  copyFormat,
  exportFormat,
  valueMode,
  brandName,
  onCopy,
  onNavigate,
  onExportCopy,
  onExportFormatChange,
  onCopyFormatChange,
}: ContinuousRampProps) {
  const multiColumn = (paletteHexes?.length ?? 0) >= 2;
  // One export group per color. Multi-column → a ramp per palette swatch (with
  // collision-safe names); single → just the active ramp already in hand.
  const exportGroups = useMemo<ColorGroup[]>(() => {
    if (multiColumn) {
      return dedupeGroupNames(
        paletteHexes!.map((h, i) => ({
          name: paletteNames?.[i] ?? brandName ?? 'brand',
          tokens: rampToTokens(oklchRamp(h)),
        })),
      );
    }
    return [{ name: brandName ?? 'brand', tokens: rampToTokens(ramp) }];
  }, [multiColumn, paletteHexes, paletteNames, brandName, ramp]);
  return (
    <div className="flex flex-col gap-4">
      <Suspense fallback={<ExportDropdownFallback />}>
        <ExportDropdown
          groups={exportGroups}
          format={exportFormat}
          valueMode={valueMode}
          copyFormat={copyFormat}
          hasStop={false}
          onCopyFormatChange={onCopyFormatChange}
          onFormatChange={onExportFormatChange}
          onCopy={onExportCopy}
        />
      </Suspense>
      {multiColumn ? (
        <PaletteShadeGrid
          hexes={paletteHexes!}
          names={paletteNames}
          kind="ramp"
          copyFormat={copyFormat}
          brandName={brandName}
          onCopy={onCopy}
          onNavigate={onNavigate}
        />
      ) : (
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
      )}
    </div>
  );
}

/**
 * Height-stable placeholder for the lazy `ExportDropdown` chunk - mirrors the
 * one in `TailwindScale` so the ramp rows don't jump when the chunk arrives.
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
