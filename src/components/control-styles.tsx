/**
 * Shared styling for the inline `<select>` controls in the export-controls row
 * (the "Export" format picker and the "Copy as" value-format picker). Kept in
 * one place so the two dropdowns stay the exact same style and height - the
 * boxes drift apart fast if each owns its own Tailwind string.
 *
 * Both consumers (`ExportDropdown`, `CopyFormatPicker`) live under the lazy
 * export boundary, so this module rides into that chunk - it never touches the
 * eager path.
 */

export const SELECT_CLASS =
  'appearance-none border border-ink/20 bg-paper-2 py-1 pl-2.5 pr-7 ' +
  'font-mono text-xs text-ink transition-colors duration-150 ease-out ' +
  'motion-reduce:transition-none hover:border-ink/40 hover:bg-paper-2 ' +
  'focus-visible:outline-none focus-visible:border-accent ' +
  'focus-visible:ring-2 focus-visible:ring-accent/30';

/** Overlaid, non-interactive chevron for an `appearance-none` select box. */
export function SelectChevron() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="pointer-events-none absolute right-2 top-1/2 h-[1.05rem] w-[1.05rem] -translate-y-1/2 text-mute"
    >
      <path d="M4 6.5 8 10.5l4-4" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
