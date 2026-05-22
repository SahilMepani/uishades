import type {
  ContinuousRamp as ContinuousRampData,
  CopyFormat,
  Hex,
} from '../lib/color/types';
import ShadeRow from './ShadeRow';

/**
 * Renders a `ContinuousRamp` as a stack of `<ShadeRow>` entries. The
 * mode toggle (OKLCH vs Classic) is owned by the parent — this component
 * is purely presentational. The ramp data already carries its mode in
 * `ramp.mode`; we surface it as a heading hint and as a data attribute
 * for tests.
 */

export interface ContinuousRampProps {
  ramp: ContinuousRampData;
  copyFormat: CopyFormat;
  brandName?: string;
  onCopy: (hex: Hex) => void;
  onNavigate: (hex: Hex) => void;
}

export default function ContinuousRamp({
  ramp,
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
      aria-label={`Continuous ramp (${ramp.mode})`}
      className="flex w-full flex-col border-b border-ink/15"
    >
      {ramp.shades.map((shade, i) => (
        <div role="listitem" key={`${shade.hex}-${i}`}>
          <ShadeRow
            shade={shade}
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
