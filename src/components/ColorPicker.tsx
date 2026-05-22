import { useCallback, useEffect, useRef, useState } from 'react';
import { HexColorPicker } from 'react-colorful';
import type { Hex } from '../lib/color/types';
import { parseColor } from '../lib/color/parse';

/**
 * Custom popover color picker, replacing the native `<input type="color">`.
 *
 * Trigger: the 100×100 swatch (rendered by the parent), which we wrap so its
 * click toggles the popover. The popover hosts:
 *   - react-colorful's HexColorPicker (saturation square + hue strip)
 *   - a smart text input that accepts hex, rgb(), hsl(), oklch(), and CSS
 *     named colors — parsed through the shared `parseColor` (culori)
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
  // Keep the popover node mounted during the closing animation so the
  // scale+fade-out transition can play. `mounted` controls DOM presence;
  // `visible` flips on the next frame after mount to drive the transition
  // end-state via the `data-open` attribute and `.popover-anim` styles.
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const popoverId = 'color-picker-popover';

  useEffect(() => {
    if (open) {
      setMounted(true);
      return;
    }
    setVisible(false);
    const t = window.setTimeout(() => setMounted(false), 160);
    return () => window.clearTimeout(t);
  }, [open]);

  // Once the popover is mounted with `data-open="false"`, force a reflow so
  // the browser locks in the closed-state computed style; then flip
  // `visible` so the CSS transition has a real start → end delta to animate.
  // Without the reflow, React commits both the mount and the data-open
  // change in the same paint, and the open animation is silently collapsed.
  useEffect(() => {
    if (!mounted) return;
    const node = popoverRef.current;
    if (node) void node.offsetHeight;
    setVisible(true);
  }, [mounted]);

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

  // Smart text input — accepts hex (`#rrggbb`, `#rgb`, bare `rrggbb`),
  // `rgb()`, `hsl()`, `oklch()`, and CSS named colors. We hold a separate
  // `inputValue` so the user's in-progress typing isn't clobbered each time
  // `onChange` updates the parent's hex (and thus the `hex` prop here).
  const [inputValue, setInputValue] = useState<string>(() => hex.slice(1));

  // Sync from the parent only when `hex` changes from outside (e.g. the
  // saturation/hue control). If the user's typed value already resolves to
  // the new hex, leave it alone so we preserve case and format.
  useEffect(() => {
    let derived: string | null = null;
    try {
      derived = parseColor(inputValue);
    } catch {
      /* unparseable — fall through and sync */
    }
    if (derived !== hex) {
      setInputValue(hex.slice(1));
    }
    // intentionally only on hex change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hex]);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      setInputValue(raw);
      try {
        onChange(parseColor(raw));
      } catch {
        /* partial or invalid input — wait for more keystrokes */
      }
    },
    [onChange],
  );

  const handleInputBlur = useCallback(() => {
    // On blur, snap the field back to the canonical hex if the user left it
    // in an unparseable state (e.g. half-typed "rgb(255"). Parseable values
    // stay as the user typed them — useful when entering, say, "coral" or
    // "rgb(255 0 0)" and wanting to see what you typed.
    try {
      parseColor(inputValue);
    } catch {
      setInputValue(hex.slice(1));
    }
  }, [inputValue, hex]);

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
    <div ref={wrapRef} className={`relative ${className ?? 'inline-block'}`}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-label={triggerLabel}
        aria-expanded={open}
        aria-controls={popoverId}
        className="block w-full cursor-pointer p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
      >
        {children}
      </button>

      {mounted && (
        <div
          ref={popoverRef}
          id={popoverId}
          role="dialog"
          aria-label="Color picker"
          data-open={visible ? 'true' : 'false'}
          aria-hidden={!visible}
          className={
            'popover-anim absolute left-0 top-full z-40 mt-2 flex w-[232px] flex-col gap-3 ' +
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
              <input
                type="text"
                value={inputValue}
                onChange={handleInputChange}
                onBlur={handleInputBlur}
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                aria-label="Color value (hex, rgb, hsl, oklch, or name)"
                placeholder="hex, rgb, hsl, oklch"
                className={
                  'h-9 w-full bg-transparent px-2 font-mono text-sm tracking-tight text-ink ' +
                  'placeholder:text-mute/70 focus:outline-none'
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
