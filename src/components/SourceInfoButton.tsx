import { useEffect, useId, useRef, useState } from 'react';

/**
 * `?` info button + popover shown next to a "Source" badge, explaining what the
 * source shade is. Same click-to-toggle / outside-click / Escape pattern as
 * `WcagInfoButton` in ShadeTool. Used by both the single-color `ShadeRow` and
 * the multi-color `PaletteShadeGrid`, whose swatches are `role="button"` divs -
 * so every pointer/keyboard handler stops propagation here so a click on the
 * icon or its popover never triggers the swatch's copy/inspect/navigate action.
 * The button color follows the row's chosen foreground so it stays legible on
 * any swatch.
 */
export default function SourceInfoButton({ fg }: { fg: 'white' | 'black' }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: Event) => {
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

  const ring = fg === 'white' ? 'ring-white/40 hover:ring-white/70' : 'ring-black/30 hover:ring-black/60';

  return (
    <div
      ref={wrapRef}
      className="relative inline-flex shrink-0"
      // The swatch is a role="button" div; keep icon interactions from bubbling
      // up into its copy/inspect/navigate click + Enter handlers.
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        aria-label="What is the source shade?"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className={
          'inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] ' +
          'font-semibold leading-none ring-1 ' +
          ring +
          ' focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current'
        }
      >
        ?
      </button>
      {open && (
        <div
          id={id}
          role="dialog"
          aria-label="About the source shade"
          className={
            'absolute left-0 top-full z-40 mt-2 w-64 max-w-[calc(100vw-2rem)] ' +
            'border border-hairline bg-paper p-3 text-left font-sans text-xs font-normal normal-case leading-relaxed tracking-normal text-ink ' +
            'shadow-[0_10px_30px_rgba(17,17,16,0.12)]'
          }
        >
          <p>
            The <span className="font-semibold">source</span> is the color you
            entered. Every other shade is derived from it - lighter tints above,
            darker shades below - so the palette stays consistent with the color
            you picked.
          </p>
        </div>
      )}
    </div>
  );
}
