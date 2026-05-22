import { useCallback, useEffect, useRef, useState } from 'react';
import { HexColorPicker, HexColorInput } from 'react-colorful';
import type { Hex } from '../lib/color/types';

/**
 * Custom popover color picker, replacing the native `<input type="color">`.
 *
 * Trigger: the 100×100 swatch (rendered by the parent), which we wrap so its
 * click toggles the popover. The popover hosts:
 *   - react-colorful's HexColorPicker (saturation square + hue strip)
 *   - a hex text input (HexColorInput, auto-normalized to #rrggbb)
 *   - an EyeDropper button when the browser supports the API (Chromium)
 *
 * Styling: react-colorful's default rounded look is overridden via CSS in
 * `global.css` (`.react-colorful` selectors) to match the editorial hairline
 * language. We don't import react-colorful's CSS — it auto-injects.
 *
 * Closes on outside click and Escape, matching the AlgorithmInfoButton
 * pattern in ShadeTool.tsx.
 */

interface EyeDropperResult {
  sRGBHex: string;
}
interface EyeDropperApi {
  open(): Promise<EyeDropperResult>;
}
type EyeDropperCtor = new () => EyeDropperApi;
function getEyeDropperCtor(): EyeDropperCtor | null {
  if (typeof window === 'undefined') return null;
  const ctor = (window as unknown as { EyeDropper?: EyeDropperCtor }).EyeDropper;
  return typeof ctor === 'function' ? ctor : null;
}

export interface ColorPickerProps {
  hex: Hex;
  onChange: (next: Hex) => void;
  /** Rendered inside the trigger button (typically the swatch + icon). */
  triggerLabel: string;
  className?: string;
  children: React.ReactNode;
}

export default function ColorPicker({
  hex,
  onChange,
  triggerLabel,
  className,
  children,
}: ColorPickerProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const popoverId = 'color-picker-popover';

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: globalThis.MouseEvent) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const handlePickerChange = useCallback(
    (next: string) => {
      // react-colorful gives us a fully-formed #rrggbb in lowercase.
      onChange(next as Hex);
    },
    [onChange],
  );

  const handleEyeDropper = useCallback(async () => {
    const Ctor = getEyeDropperCtor();
    if (!Ctor) return;
    try {
      const result = await new Ctor().open();
      const sampled = result.sRGBHex.toLowerCase();
      if (/^#[0-9a-f]{6}$/.test(sampled)) {
        onChange(sampled as Hex);
      }
    } catch {
      /* user canceled — no-op */
    }
  }, [onChange]);

  const hasEyeDropper = getEyeDropperCtor() !== null;

  return (
    <div ref={wrapRef} className={`relative inline-block ${className ?? ''}`}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-label={triggerLabel}
        aria-expanded={open}
        aria-controls={popoverId}
        className="block cursor-pointer p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
      >
        {children}
      </button>

      {open && (
        <div
          id={popoverId}
          role="dialog"
          aria-label="Color picker"
          className={
            'absolute left-0 top-full z-40 mt-2 flex w-[232px] flex-col gap-3 ' +
            'border border-hairline bg-paper p-3 ' +
            'shadow-[0_12px_32px_rgba(17,17,16,0.14)]'
          }
        >
          <HexColorPicker color={hex} onChange={handlePickerChange} />
          <div className="flex items-stretch gap-2">
            {hasEyeDropper && (
              <button
                type="button"
                onClick={handleEyeDropper}
                aria-label="Pick color from screen"
                title="Pick color from screen"
                className={
                  'inline-flex h-9 w-9 shrink-0 items-center justify-center ' +
                  'border border-ink/20 bg-paper text-ink hover:bg-paper-2 ' +
                  'focus-visible:outline-none focus-visible:border-accent'
                }
              >
                <EyeDropperIcon className="h-4 w-4" />
              </button>
            )}
            <div className="flex flex-1 items-center border border-ink/20 bg-paper focus-within:border-ink">
              <span aria-hidden="true" className="px-2 font-mono text-sm text-mute">#</span>
              <HexColorInput
                color={hex.slice(1)}
                onChange={(v) => onChange(('#' + v) as Hex)}
                prefixed={false}
                aria-label="Hex value"
                className={
                  'h-9 w-full bg-transparent pr-2 font-mono text-sm tracking-tight text-ink ' +
                  'placeholder:text-mute/70 focus:outline-none uppercase'
                }
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function EyeDropperIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className={className ?? 'h-4 w-4'}>
      <path d="M11.2 1.6a2.2 2.2 0 0 1 3.1 3.1l-1.4 1.4-3.1-3.1 1.4-1.4Z" fill="currentColor"/>
      <path d="m9.1 3.7 3.1 3.1-6.6 6.6-3.1-.5L2 9.8 9.1 3.7Z" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round"/>
    </svg>
  );
}
