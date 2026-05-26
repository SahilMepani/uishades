import type {
  ContinuousRamp as ContinuousRampData,
  CopyFormat,
  Hex,
} from '../lib/color/types';
import ShadeRow from './ShadeRow';

/**
 * Renders a `ContinuousRamp` as a stack of `<ShadeRow>` entries. Purely
 * presentational — the algorithm toggle (Tailwind scale vs this OKLCH ramp)
 * is owned by the parent. The ramp data carries its mode in `ramp.mode`
 * (always `oklch` now that the classic walk is no longer surfaced in the
 * UI); we keep it as a data attribute for tests.
 */

export interface ContinuousRampProps {
  ramp: ContinuousRampData;
  /** Pinned source hex — every non-source row renders this in a 20% band. */
  sourceHex: Hex;
  copyFormat: CopyFormat;
  brandName?: string;
  onCopy: (hex: Hex) => void;
  onNavigate: (hex: Hex) => void;
}

export default function ContinuousRamp({
  ramp,
  sourceHex,
  copyFormat,
  brandName,
  onCopy,
  onNavigate,
}: ContinuousRampProps) {
  return (
    <div
      data-ramp-mode={ramp.mode}
      data-shade-count={ramp.shades.length}
      role="list"
      aria-label="OKLCH ramp"
      className="flex w-full flex-col border-b border-ink/15"
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
  );
}
