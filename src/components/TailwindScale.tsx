import { lazy, Suspense, useMemo } from 'react';
import type {
  CopyFormat,
  ExportFormat,
  Hex,
  TailwindScale as TailwindScaleData,
} from '../lib/color/types';
import { scaleToTokens, dedupeGroupNames, type ColorGroup } from '../lib/exports/tokens';
import { buildScale } from '../lib/color/scale';
import ShadeRow from './ShadeRow';
import PaletteShadeGrid from './PaletteShadeGrid';

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
  /**
   * Palette tray colors (in tray order). Two or more swaps the single scale
   * for a column-per-color grid aligned with the `PalettePreviewBar` band; the
   * export controls stay put but now emit every color, not just the active one.
   */
  paletteHexes?: Hex[];
  /**
   * Brand name per palette color, parallel to `paletteHexes` (nearest-named
   * slug). Used to name each color's export group and its per-column copy
   * labels. Falls back to `brandName` / `'brand'` when absent.
   */
  paletteNames?: string[];
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
  paletteHexes,
  paletteNames,
  copyFormat,
  exportFormat,
  brandName,
  onCopy,
  onNavigate,
  onExportCopy,
  onExportFormatChange,
  onCopyFormatChange,
}: TailwindScaleProps) {
  const multiColumn = (paletteHexes?.length ?? 0) >= 2;
  // One export group per color. Multi-column → a scale per palette swatch (with
  // collision-safe names); single → just the active scale already in hand.
  const exportGroups = useMemo<ColorGroup[]>(() => {
    if (multiColumn) {
      return dedupeGroupNames(
        paletteHexes!.map((h, i) => ({
          name: paletteNames?.[i] ?? brandName ?? 'brand',
          tokens: scaleToTokens(buildScale(h)),
        })),
      );
    }
    return [{ name: brandName ?? 'brand', tokens: scaleToTokens(scale) }];
  }, [multiColumn, paletteHexes, paletteNames, brandName, scale]);
  return (
    <div className="flex flex-col gap-4" data-anchor-stop={scale.anchorStop}>
      <Suspense fallback={<ExportDropdownFallback />}>
        <ExportDropdown
          groups={exportGroups}
          format={exportFormat}
          valueMode="hex"
          copyFormat={copyFormat}
          hasStop={true}
          onCopyFormatChange={onCopyFormatChange}
          onFormatChange={onExportFormatChange}
          onCopy={onExportCopy}
        />
      </Suspense>
      {multiColumn ? (
        <PaletteShadeGrid
          hexes={paletteHexes!}
          names={paletteNames}
          kind="scale"
          copyFormat={copyFormat}
          brandName={brandName}
          onCopy={onCopy}
          onNavigate={onNavigate}
        />
      ) : (
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
      )}
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
