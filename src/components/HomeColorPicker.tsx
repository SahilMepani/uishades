import { useEffect, useRef, useState } from 'react';
import ColorPicker from './ColorPicker';
import type { Hex } from '../lib/color/types';
import { parseColor } from '../lib/color/parse';
import { NAMED_COLORS_SLIM } from '../lib/data/named-colors-slim';

/**
 * Homepage color-picker island.
 *
 * Sits before the hex input inside the editorial form. The form is pure
 * HTML with an inline submit handler that reads `input.value` directly,
 * so rather than lifting state into React (which would mean rewriting the
 * form), we poke the DOM input by id when the user picks a color, and we
 * listen to the input's `input` event so typing a recognized color updates
 * the swatch live. The placeholder stays visible until first interaction
 * - by design.
 */

// Used only to seed react-colorful's popover when the user opens it before
// picking anything. The swatch itself stays transparent until first pick.
const POPOVER_SEED: Hex = '#4040ff';
const INPUT_ID = 'hex';

// Lookup keyed by `normName` (lowercased, whitespace-stripped) so "Alice
// Blue" / "aliceblue" / "tailwind-blue-500" all hit. Includes the project's
// Tailwind/Bootstrap/Material slugs in addition to the CSS named colors
// that culori's parser handles natively.
const nameToHex: Record<string, Hex> = (() => {
  const map: Record<string, Hex> = Object.create(null);
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '');
  for (const c of NAMED_COLORS_SLIM) {
    map[norm(c.slug)] = c.hex;
    if (c.name) map[norm(c.name)] = c.hex;
    if (c.aliases) for (const a of c.aliases) map[norm(a)] = c.hex;
  }
  return map;
})();

function resolveTyped(raw: string): Hex | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const named = nameToHex[trimmed.toLowerCase().replace(/\s+/g, '')];
  if (named) return named;
  try {
    return parseColor(trimmed);
  } catch {
    return null;
  }
}

export default function HomeColorPicker() {
  const [hex, setHex] = useState<Hex | null>(null);
  // Tracks the most recent hex pushed to the DOM input from the picker, so
  // the input listener can ignore the synthetic echo and avoid loops.
  const lastPushedRef = useRef<Hex | null>(null);

  const handleChange = (next: Hex) => {
    setHex(next);
    const el = document.getElementById(INPUT_ID);
    if (el instanceof HTMLInputElement) {
      lastPushedRef.current = next;
      el.value = next;
    }
  };

  useEffect(() => {
    const el = document.getElementById(INPUT_ID);
    if (!(el instanceof HTMLInputElement)) return;
    // `client:idle` may hydrate after the user has already typed a value;
    // pick that up so the swatch isn't out of sync on first paint.
    if (el.value.trim()) {
      const seeded = resolveTyped(el.value);
      if (seeded) setHex(seeded);
    }
    const onInput = () => {
      const raw = el.value;
      // Programmatic writes from handleChange don't fire `input`, but guard
      // anyway in case a browser extension or future change synthesizes one.
      if (lastPushedRef.current && raw === lastPushedRef.current) return;
      if (!raw.trim()) {
        setHex(null);
        return;
      }
      const resolved = resolveTyped(raw);
      if (resolved) setHex(resolved);
      // Invalid / partial input: leave the swatch on the last valid color
      // rather than flickering to the placeholder mid-edit.
    };
    el.addEventListener('input', onInput);
    return () => el.removeEventListener('input', onInput);
  }, []);

  const picked = hex !== null;

  return (
    <ColorPicker
      hex={hex ?? POPOVER_SEED}
      onChange={handleChange}
      triggerLabel="Pick a color"
      className="inline-block shrink-0"
    >
      <span
        aria-hidden="true"
        className="relative inline-flex h-[52px] w-[52px] items-center justify-center border-r border-ink/80 transition-[background-color] duration-150 ease-out motion-reduce:transition-none"
        style={picked ? { backgroundColor: hex } : undefined}
      >
        <span className="inline-flex transition-transform duration-150 ease-out group-hover:scale-110 group-focus-visible:scale-110 motion-reduce:transition-none motion-reduce:group-hover:scale-100 motion-reduce:group-focus-visible:scale-100">
          {picked ? (
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-paper/85 text-ink ring-1 ring-ink/15 shadow-sm">
              <PickerIcon className="h-3 w-3" />
            </span>
          ) : (
            <PickerIcon className="h-4 w-4 text-ink" />
          )}
        </span>
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
