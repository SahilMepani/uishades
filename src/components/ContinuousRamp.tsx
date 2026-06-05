import type {
  ContinuousRamp as ContinuousRampData,
  CopyFormat,
  ExportFormat,
  Hex,
} from '../lib/color/types';
import type { ColorGroup, ValueMode } from '../lib/exports/tokens';
import ShadeRow from './ShadeRow';
import PaletteShadeGrid from './PaletteShadeGrid';
import ExportRow from './ExportRow';

/**
 * Renders a `ContinuousRamp` (OKLCH 20-step ramp) as a stack of `<ShadeRow>`
 * entries, with the shared `ExportRow` atop it (the same lazy boundary the
 * Tailwind scale and the sidebar use, so the export chunk downloads once).
 *
 * Ramp tokens are keyed by 1-based step index (1..20). The export value format
 * (hex vs oklch()) is derived upstream from the shared "Copy as" picker and
 * passed down as `valueMode` - there is no separate value control. The export
 * groups are derived in `ShadeTool` and passed as `exportGroups`. The ramp data
 * carries its mode in `ramp.mode` (always `oklch` now that the classic walk is
 * no longer surfaced); we keep it as a data attribute for tests.
 */

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
   * slug). Names each color's per-column copy labels. Falls back to
   * `brandName` / `'brand'` when absent.
   */
  paletteNames?: string[];
  copyFormat: CopyFormat;
  exportFormat: ExportFormat;
  /**
   * Export groups for the current ramp/palette, derived in `ShadeTool` so the
   * shade-grid row and the sidebar row emit identical code (single source of
   * truth). One group per palette color in multi-column mode, else just the
   * active ramp.
   */
  exportGroups: ColorGroup[];
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
  exportGroups,
  valueMode,
  brandName,
  onCopy,
  onNavigate,
  onExportCopy,
  onExportFormatChange,
  onCopyFormatChange,
}: ContinuousRampProps) {
  const multiColumn = (paletteHexes?.length ?? 0) >= 2;
  return (
    <div className="flex flex-col gap-4">
      <ExportRow
        groups={exportGroups}
        format={exportFormat}
        valueMode={valueMode}
        copyFormat={copyFormat}
        hasStop={false}
        onCopyFormatChange={onCopyFormatChange}
        onFormatChange={onExportFormatChange}
        onCopy={onExportCopy}
      />
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
