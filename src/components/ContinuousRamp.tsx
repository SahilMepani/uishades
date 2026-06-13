import type {
  ContinuousRamp as ContinuousRampData,
  CopyFormat,
  Hex,
} from '../lib/color/types';
import { STOPS } from '../lib/color/anchors';
import ShadeRow from './ShadeRow';
import PaletteShadeGrid from './PaletteShadeGrid';

/**
 * Renders a `ContinuousRamp` (OKLCH 11-step ramp) as a stack of `<ShadeRow>`
 * entries. The export control no longer lives here - it sits in the metadata
 * row up in `ShadeTool` as a single "Export" link (see `ExportControls`).
 *
 * The ramp data carries its mode in `ramp.mode` (always `oklch` now that the
 * classic walk is no longer surfaced); we keep it as a data attribute for tests.
 */

export interface ContinuousRampProps {
  ramp: ContinuousRampData;
  /** Pinned source hex - every non-source row renders this in a 20% band. */
  sourceHex: Hex;
  /**
   * Palette tray colors (in tray order). When two or more are present the
   * single ramp is replaced by a column-per-color grid that lines up with the
   * `PalettePreviewBar` band above.
   */
  paletteHexes?: Hex[];
  /**
   * Brand name per palette color, parallel to `paletteHexes` (nearest-named
   * slug). Names each color's per-column copy labels. Falls back to
   * `brandName` / `'brand'` when absent.
   */
  paletteNames?: string[];
  copyFormat: CopyFormat;
  brandName?: string;
  onCopy: (hex: Hex) => void;
  /** Multi-color grid only: use a shade as the new source. */
  onNavigate: (hex: Hex) => void;
  /** Single-color rows: load a shade into the picker without changing source. */
  onInspect: (hex: Hex) => void;
}

export default function ContinuousRamp({
  ramp,
  sourceHex,
  paletteHexes,
  paletteNames,
  copyFormat,
  brandName,
  onCopy,
  onNavigate,
  onInspect,
}: ContinuousRampProps) {
  const multiColumn = (paletteHexes?.length ?? 0) >= 2;
  return (
    <div className="flex flex-col gap-4">
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
                gutterLabel={STOPS[i] ?? i + 1}
                onCopy={onCopy}
                onInspect={onInspect}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
