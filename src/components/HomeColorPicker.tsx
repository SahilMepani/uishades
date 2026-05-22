import { useState } from 'react';
import ColorPicker from './ColorPicker';
import type { Hex } from '../lib/color/types';

/**
 * Homepage color-picker island.
 *
 * Sits before the hex input inside the editorial form. The form is pure
 * HTML with an inline submit handler that reads `input.value` directly,
 * so rather than lifting state into React (which would mean rewriting the
 * form), we poke the DOM input by id when the user picks a color. The
 * placeholder stays visible until first interaction — by design.
 */

// Used only to seed react-colorful's popover when the user opens it before
// picking anything. The swatch itself stays transparent until first pick.
const POPOVER_SEED: Hex = '#4040ff';
const INPUT_ID = 'hex';

export default function HomeColorPicker() {
  const [hex, setHex] = useState<Hex | null>(null);

  const handleChange = (next: Hex) => {
    setHex(next);
    const el = document.getElementById(INPUT_ID);
    if (el instanceof HTMLInputElement) {
      el.value = next;
    }
  };

  const picked = hex !== null;

  return (
    <ColorPicker
      hex={hex ?? POPOVER_SEED}
      onChange={handleChange}
      triggerLabel="Pick a color"
      className="shrink-0"
    >
      <span
        aria-hidden="true"
        className="relative inline-flex h-[52px] w-[52px] items-center justify-center border-r border-ink/80"
        style={picked ? { backgroundColor: hex } : undefined}
      >
        {picked ? (
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-paper/85 text-ink ring-1 ring-ink/15 shadow-sm">
            <PickerIcon className="h-3 w-3" />
          </span>
        ) : (
          <PickerIcon className="h-4 w-4 text-ink" />
        )}
      </span>
    </ColorPicker>
  );
}

function PickerIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className={className ?? 'h-4 w-4'}>
      <path d="M11.2 1.6a2.2 2.2 0 0 1 3.1 3.1l-1.4 1.4-3.1-3.1 1.4-1.4Z" fill="currentColor"/>
      <path d="m9.1 3.7 3.1 3.1-6.6 6.6-3.1-.5L2 9.8 9.1 3.7Z" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round"/>
    </svg>
  );
}
