import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { HexColorPicker } from 'react-colorful';
import type { CopyFormat, Hex } from '../lib/color/types';
import { parseColor, toOklch } from '../lib/color/parse';
import { formatForCopy } from '../lib/color/format';

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

// The format the popover's value input shows. The dropdown offers these; the
// active one defaults to the page's "Copy as" preference (see `copyToChannel`).
const CHANNEL_FORMATS = ['rgb', 'hsl', 'oklch', 'hex'] as const;
type ChannelFormat = (typeof CHANNEL_FORMATS)[number];

const CHANNEL_META: Record<ChannelFormat, { label: string; placeholder: string }> = {
  rgb: { label: 'RGB', placeholder: 'r g b' },
  hsl: { label: 'HSL', placeholder: 'h s% l%' },
  oklch: { label: 'OKLCH', placeholder: 'l c h' },
  hex: { label: 'HEX', placeholder: 'rrggbb' },
};

// The "Paste any color format" onboarding hint auto-appears when the picker
// opens, but only this many times total (tracked in localStorage), then never.
const PASTE_HINT_KEY = 'shades.pasteHintShown';
const PASTE_HINT_MAX = 3;

// Map the page's "Copy as" format onto a channel format so the picker opens in
// whatever the user copies as. `cssVar` / `tailwindClass` aren't color-value
// formats, so they have no channel equivalent — the picker keeps its default.
function copyToChannel(cf: CopyFormat | undefined): ChannelFormat | null {
  switch (cf) {
    case 'hex':
    case 'rgb':
    case 'hsl':
    case 'oklch':
      return cf;
    default:
      return null;
  }
}

// Bare (wrapper-less) representation of `hex` in the given format — the form
// shown at rest in the channel input. RGB/HSL reuse `formatForCopy` and drop
// the `fn( … )` wrapper; HEX drops the leading `#`. OKLCH is rounded coarser
// than the copy row (2dp L/C, integer hue) so the value fits the narrow input
// at rest; the read-only OKLCH copy row keeps full precision.
function formatChannels(hex: Hex, fmt: ChannelFormat): string {
  if (fmt === 'hex') return hex.slice(1);
  if (fmt === 'oklch') {
    const c = toOklch(hex);
    const l = Math.round(c.l * 100) / 100;
    const ch = Math.round(c.c * 100) / 100;
    const h = Number.isFinite(c.h) ? Math.round(c.h) : 0;
    return `${l} ${ch} ${h}`;
  }
  return formatForCopy(hex, fmt).replace(/^[a-z]+\(/i, '').replace(/\)$/, '');
}

// Parse a bare channel string back to canonical hex. Wraps the value in its
// format's CSS function so culori can read it; if the user pasted a complete
// `fn( … )` form (or a hex/named color), hand it to `parseColor` untouched.
function parseChannels(raw: string, fmt: ChannelFormat): Hex {
  const v = raw.trim();
  if (fmt === 'hex' || v.includes('(')) return parseColor(v);
  try {
    return parseColor(`${fmt}(${v})`);
  } catch (err) {
    // Not valid channel digits for this format — fall back to parsing it
    // verbatim ONLY if it contains a letter: a CSS named color ('coral') or a
    // bare hex like 'ff0000'. A pure-numeric value ('255') stays channel input
    // and must NOT be reinterpreted as the 3-digit hex '#225555'.
    if (/[a-z]/i.test(v)) return parseColor(v);
    throw err;
  }
}

// Sniff the format of a pasted/typed value so the dropdown can switch to match
// it. Only fires on an unambiguous lead: a `fn(` prefix or a `#`-prefixed hex.
// Bare numbers (`240 100% 62.5%`, `64 64 255`) return `null` so they stay in
// the currently-selected format — a bare `255` must not be mistaken for hex.
function detectFormat(raw: string): ChannelFormat | null {
  const v = raw.trim().toLowerCase();
  if (/^hsla?\(/.test(v)) return 'hsl';
  if (/^rgba?\(/.test(v)) return 'rgb';
  if (/^oklch\(/.test(v)) return 'oklch';
  if (/^#[0-9a-f]{3,8}$/.test(v)) return 'hex';
  return null;
}

// Drop the wrapper so the field shows the bare value after a format switch:
// `hsl(240 100% 62.5%)` → `240 100% 62.5%`, `#ff0000` → `ff0000`.
function stripWrapper(raw: string, fmt: ChannelFormat): string {
  const v = raw.trim();
  if (fmt === 'hex') return v.replace(/^#/, '');
  return v.replace(/^[a-z]+\(/i, '').replace(/\)$/, '');
}

export interface ColorPickerProps {
  hex: Hex;
  onChange: (next: Hex) => void;
  /** Rendered inside the trigger button (typically the swatch + icon). */
  triggerLabel: string;
  /**
   * The page's current "Copy as" format. The picker's value field defaults to
   * the matching channel format so the two stay in sync — until the user picks
   * a different format inside the picker, which then wins until they change the
   * "Copy as" preference again.
   */
  copyFormat?: CopyFormat;
  className?: string;
  children: React.ReactNode;
}

export default function ColorPicker({
  hex,
  onChange,
  triggerLabel,
  copyFormat,
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
  // The one-time "Paste any color format" hint (auto-shown on open, capped).
  const [showHint, setShowHint] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  // Unique per instance — the tool renders two ColorPickers (the desktop left
  // rail and the mobile panel), so a hardcoded id would collide.
  const popoverId = useId();

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
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [mounted]);

  // "Paste any color format" hint: auto-show on each open until it has been
  // shown PASTE_HINT_MAX times, then never again. The count lives in
  // localStorage so it survives reloads and is shared by both ColorPicker
  // instances (desktop rail + mobile panel). Auto-dismisses after a few seconds
  // and on close.
  useEffect(() => {
    if (!mounted) {
      setShowHint(false);
      return;
    }
    let count = 0;
    try {
      count = parseInt(window.localStorage.getItem(PASTE_HINT_KEY) ?? '0', 10) || 0;
    } catch {
      /* localStorage may be unavailable in private mode */
    }
    if (count >= PASTE_HINT_MAX) return;
    try {
      window.localStorage.setItem(PASTE_HINT_KEY, String(count + 1));
    } catch {
      /* ignore — best-effort */
    }
    setShowHint(true);
    const t = window.setTimeout(() => setShowHint(false), 4000);
    return () => window.clearTimeout(t);
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

  // The popover's single value input. The active format follows the page's
  // "Copy as" preference (`copyToChannel(copyFormat)`) unless the user picks a
  // different one inside the picker — that override is held in `formatOverride`
  // and wins until the "Copy as" preference itself changes (the effect below
  // clears it). `channelText` mirrors the user's in-progress typing as a bare
  // value (no `fn( … )` wrapper, no leading `#`).
  const [formatOverride, setFormatOverride] = useState<ChannelFormat | null>(null);
  const channelFormat: ChannelFormat = formatOverride ?? copyToChannel(copyFormat) ?? 'hex';
  const [channelText, setChannelText] = useState<string>(() =>
    formatChannels(hex, channelFormat),
  );

  // When the "Copy as" preference changes, drop any in-picker override so the
  // picker re-syncs to the new copy format. (Runs on mount too, a no-op there.)
  useEffect(() => {
    setFormatOverride(null);
  }, [copyFormat]);

  // Reformat the field whenever the hex changes from *outside* (saturation/hue
  // drag, eyedropper) OR the active format changes — unless the user's current
  // typing already resolves to this hex, which we preserve. The `derived !==
  // hex` guard also lets the in-handler updates below short-circuit this effect
  // so they don't clobber a freshly-typed value.
  useEffect(() => {
    let derived: Hex | null = null;
    try {
      derived = parseChannels(channelText, channelFormat);
    } catch {
      /* unparseable — fall through and reformat */
    }
    if (derived !== hex) setChannelText(formatChannels(hex, channelFormat));
    // intentionally only on hex / format change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hex, channelFormat]);

  const handleChannelChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      // Auto-detect the format from an unambiguous lead (`hsl(`, `#…`, …). If
      // it differs from the active format, switch the dropdown to match (an
      // override) and strip the wrapper so the field shows the bare value.
      // Override, text, and the parent `onChange` all run in this one handler
      // so React batches them into a single commit (no flash; effect guard
      // short-circuits).
      const detected = detectFormat(raw);
      const fmt = detected && detected !== channelFormat ? detected : channelFormat;
      if (fmt !== channelFormat) setFormatOverride(fmt);
      setChannelText(detected ? stripWrapper(raw, fmt) : raw);
      try {
        onChange(parseChannels(raw, fmt));
      } catch {
        /* partial or invalid input — wait for more keystrokes */
      }
    },
    [onChange, channelFormat],
  );

  const handleChannelBlur = useCallback(() => {
    try {
      parseChannels(channelText, channelFormat);
    } catch {
      setChannelText(formatChannels(hex, channelFormat));
    }
  }, [channelText, channelFormat, hex]);

  // Manual dropdown change: record the override and reformat the *current*
  // color into the chosen format — synchronously alongside the override flip so
  // the new label and value paint together (the [hex, channelFormat] effect's
  // guard then short-circuits).
  const handleChannelFormatSelect = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const next = e.target.value as ChannelFormat;
      setFormatOverride(next);
      setChannelText(formatChannels(hex, next));
    },
    [hex],
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
    <div ref={wrapRef} className={`relative ${className ?? 'inline-block'}`}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-label={triggerLabel}
        title={triggerLabel}
        aria-expanded={open}
        aria-controls={popoverId}
        className="group block w-full cursor-pointer p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
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
          // Width matches the full input row the picker was opened from.
          // `w-[400%]` works because the trigger wrapper is `w-1/4` of that row
          // (set by PreviewBlock in ShadeTool) — 400% of a quarter = the whole
          // row. If that wrapper width ever changes, this number must too.
          className={
            'popover-anim absolute left-0 top-full z-40 mt-2 flex w-[400%] flex-col gap-3 ' +
            'border border-hairline bg-paper p-3 ' +
            'shadow-[0_12px_32px_rgba(17,17,16,0.14)]'
          }
        >
          <HexColorPicker color={hex} onChange={handlePickerChange} />
          {/* One input. The dropdown picks the format; the field holds the bare
              value (no `fn( … )` wrapper, no `#`). Pasting a recognizable value
              auto-switches the dropdown to match and strips the wrapper. */}
          <div className="flex items-stretch gap-2">
            {hasEyeDropper && (
              <button
                type="button"
                onClick={handleEyeDropper}
                aria-label="Pick color from screen"
                title="Pick color from screen"
                className={
                  'inline-flex h-9 w-9 shrink-0 items-center justify-center ' +
                  'border border-ink/20 bg-paper text-ink transition-colors duration-200 ease-out hover:bg-paper-2 ' +
                  'focus-visible:outline-none focus-visible:border-accent'
                }
              >
                <EyeDropperIcon className="h-4 w-4" />
              </button>
            )}
            {/* `flex` blockifies the <select> so it fills the row height with
                no inline-block baseline gap (which otherwise nudged it up out
                of vertical alignment with the eyedropper + value field). */}
            <div className="relative flex shrink-0">
              <select
                value={channelFormat}
                onChange={handleChannelFormatSelect}
                aria-label="Color value format"
                className={
                  'h-9 appearance-none border border-ink/20 bg-paper py-0 pl-3 pr-8 ' +
                  'font-mono text-[11px] uppercase leading-none tracking-[0.06em] text-ink ' +
                  'transition-colors duration-200 ease-out hover:bg-paper-2 ' +
                  'focus-visible:outline-none focus-visible:border-accent'
                }
              >
                {CHANNEL_FORMATS.map((f) => (
                  <option key={f} value={f}>
                    {CHANNEL_META[f].label}
                  </option>
                ))}
              </select>
              <svg
                aria-hidden="true"
                viewBox="0 0 16 16"
                className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-mute"
              >
                <path d="M4 6.5 8 10.5l4-4" fill="none" stroke="currentColor" strokeWidth="1.5" />
              </svg>
            </div>
            {/* `h-9` on the wrapper (border-box) keeps this box exactly 36px
                like the eyedropper + select — its border lives on the wrapper,
                so the inner input fills the remaining height (`h-full`) instead
                of forcing the box 2px taller and 1px out of alignment. */}
            <div className="relative flex h-9 flex-1 items-center border border-ink/20 bg-paper focus-within:border-ink">
              <input
                ref={inputRef}
                type="text"
                value={channelText}
                onChange={handleChannelChange}
                onBlur={handleChannelBlur}
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                aria-label={`${CHANNEL_META[channelFormat].label} color value`}
                placeholder={CHANNEL_META[channelFormat].placeholder}
                className={
                  'h-full w-full bg-transparent px-2 font-mono text-sm tracking-tight text-ink ' +
                  'placeholder:text-mute/70 focus:outline-none'
                }
              />
              {/* One-time onboarding hint: the dropdown shows one format, but the
                  field parses ANY — this dispels the "OKLCH-only" confusion.
                  Auto-shown on open, capped at 3 appearances total (see effect). */}
              {showHint && (
                <span
                  role="status"
                  className={
                    'pointer-events-none absolute bottom-full left-0 z-50 mb-2 whitespace-nowrap ' +
                    'bg-ink px-2.5 py-1.5 font-mono text-[11px] tracking-tight text-paper ' +
                    'shadow-[0_6px_18px_rgba(17,17,16,0.18)]'
                  }
                >
                  Paste any color format
                  <span
                    aria-hidden="true"
                    className="absolute left-4 top-full -mt-1 h-2 w-2 rotate-45 bg-ink"
                  />
                </span>
              )}
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
      <circle cx="8" cy="8" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.25"/>
      <circle cx="8" cy="8" r="1" fill="currentColor"/>
      <path d="M8 0.5v3M8 12.5v3M0.5 8h3M12.5 8h3" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round"/>
    </svg>
  );
}

