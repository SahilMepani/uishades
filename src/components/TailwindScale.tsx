import type {
  CopyFormat,
  ExportFormat,
  Hex,
  TailwindScale as TailwindScaleData,
} from '../lib/color/types';
import type { ColorGroup } from '../lib/exports/tokens';
import ShadeRow from './ShadeRow';
import PaletteShadeGrid from './PaletteShadeGrid';
import ExportRow from './ExportRow';

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
   * slug). Used to name each per-column copy label. Falls back to `brandName` /
   * `'brand'` when absent.
   */
  paletteNames?: string[];
  copyFormat: CopyFormat;
  exportFormat: ExportFormat;
  /**
   * Export groups for the current scale/palette, derived in `ShadeTool` so the
   * shade-grid row and the sidebar row emit identical code (single source of
   * truth). One group per palette color in multi-column mode, else just the
   * active scale.
   */
  exportGroups: ColorGroup[];
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
  exportGroups,
  brandName,
  onCopy,
  onNavigate,
  onExportCopy,
  onExportFormatChange,
  onCopyFormatChange,
}: TailwindScaleProps) {
  const multiColumn = (paletteHexes?.length ?? 0) >= 2;
  return (
    <div className="flex flex-col gap-4" data-anchor-stop={scale.anchorStop}>
      <ExportRow
        groups={exportGroups}
        format={exportFormat}
        valueMode="hex"
        copyFormat={copyFormat}
        hasStop={true}
        onCopyFormatChange={onCopyFormatChange}
        onFormatChange={onExportFormatChange}
        onCopy={onExportCopy}
      />
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
