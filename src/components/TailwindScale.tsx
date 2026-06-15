import type {
  CopyFormat,
  Hex,
  TailwindScale as TailwindScaleData,
} from '../lib/color/types';
import { roleLabelForStop } from '../lib/exports/tokens';
import ShadeRow from './ShadeRow';
import PaletteShadeGrid from './PaletteShadeGrid';

/**
 * Renders the 11-stop Tailwind scale. The anchor-stop row carries the `isInput`
 * flag from the builder so the `<ShadeRow>` displays the "input" badge + ring.
 *
 * The export control no longer lives here - it sits in the metadata row up in
 * `ShadeTool` as a single "Export" link (see `ExportControls`).
 */

export interface TailwindScaleProps {
  scale: TailwindScaleData;
  /** Pinned source hex - every non-anchor row renders this in a 20% band. */
  sourceHex: Hex;
  /**
   * Palette tray colors (in tray order). Two or more swaps the single scale
   * for a column-per-color grid aligned with the `PalettePreviewBar` band.
   */
  paletteHexes?: Hex[];
  /**
   * Brand name per palette color, parallel to `paletteHexes` (nearest-named
   * slug). Used to name each per-column copy label. Falls back to `brandName` /
   * `'brand'` when absent.
   */
  paletteNames?: string[];
  /** Column index where the seeded semantic block begins; gaps the grid to match the band. */
  paletteBoundary?: number;
  /** Column index of an in-flight "+" placeholder (or -1); rendered as a striped "pick a color" column. */
  palettePendingIndex?: number;
  /** Hex just added to the tray; its grid column fades in. */
  paletteEnterHex?: Hex | null;
  /**
   * Single-color view: stop → semantic role labels ("Hover", "Active", …) for
   * the active color, so each row can flag which exported role variant aliases
   * its stop. Derived from the same export groups, so the row matches the export.
   */
  roleVariants?: Map<number, string[]>;
  /** Multi-color grid: the same map per column (parallel to `paletteHexes`). */
  paletteRoleVariants?: (Map<number, string[]> | null)[];
  copyFormat: CopyFormat;
  brandName?: string;
  onCopy: (hex: Hex) => void;
  /** Multi-color grid only: use a shade as the new source. */
  onNavigate: (hex: Hex) => void;
  /** Single-color rows: load a shade into the picker without changing source. */
  onInspect: (hex: Hex) => void;
}

export default function TailwindScale({
  scale,
  sourceHex,
  paletteHexes,
  paletteNames,
  paletteBoundary,
  palettePendingIndex,
  paletteEnterHex,
  roleVariants,
  paletteRoleVariants,
  copyFormat,
  brandName,
  onCopy,
  onNavigate,
  onInspect,
}: TailwindScaleProps) {
  const multiColumn = (paletteHexes?.length ?? 0) >= 2;
  return (
    <div className="flex flex-col gap-4" data-anchor-stop={scale.anchorStop}>
      {multiColumn ? (
        <PaletteShadeGrid
          hexes={paletteHexes!}
          names={paletteNames}
          boundary={paletteBoundary}
          pendingIndex={palettePendingIndex}
          enterHex={paletteEnterHex}
          roleVariants={paletteRoleVariants}
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
                gutterLabel={shade.stop}
                roleLabel={roleLabelForStop(roleVariants, shade.stop)}
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
