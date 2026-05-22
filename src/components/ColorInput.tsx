import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import type { Hex } from '../lib/color/types';
import { parseColor } from '../lib/color/parse';
// Use the slim projection (slug/name/hex/aliases only). Importing the full
// NAMED_COLORS would drag ~150 KB of editorial blurbs and `related[]`
// arrays into the React island bundle even though the autocomplete only
// reads slug/name prefixes and renders hex swatches.
import {
  NAMED_COLORS_SLIM,
  type NamedColorSlim,
} from '../lib/data/named-colors-slim';
import { POPULAR_HEXES } from '../lib/data/popular-hexes';

/**
 * Smart parser input.
 *
 * Accepts any of: hex (with/without `#`, 3 or 6 chars), `rgb(...)`,
 * `hsl(...)`, `oklch(...)`, CSS named colors, Tailwind-style named slugs
 * (`tailwind-blue-500`, `coral`, …). On change the input value is
 * debounced 250ms, then `parseColor` is attempted. On success we call
 * `onChange(newHex)`. On parse failure we ring the input red but do not
 * fire a toast — failures during in-progress typing are very common.
 *
 * Companion controls (laid out adjacent to the text input):
 *   - A native `<input type="color">` swatch
 *   - A "Random" button that picks from `POPULAR_HEXES`
 *
 * Autocomplete: once ≥ 2 chars match a named-color slug prefix we render
 * a small dropdown. Arrow keys move focus; Enter / click accepts.
 */

export interface ColorInputProps {
  value: Hex;
  onChange: (next: Hex) => void;
}

const DEBOUNCE_MS = 250;
const MAX_SUGGESTIONS = 6;

function findSuggestions(query: string): NamedColorSlim[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  return NAMED_COLORS_SLIM
    .filter(c => c.slug.startsWith(q) || c.name.toLowerCase().startsWith(q))
    .slice(0, MAX_SUGGESTIONS);
}

export default function ColorInput({ value, onChange }: ColorInputProps) {
  // Local text mirrors what the user is typing. We don't force-sync it to
  // `value` on every keystroke; we only sync when `value` changes from the
  // outside (e.g., random button or external navigation).
  const [text, setText] = useState<string>(value);
  const [hasError, setHasError] = useState(false);
  const [suggestions, setSuggestions] = useState<NamedColorSlim[]>([]);
  const [activeSuggestion, setActiveSuggestion] = useState(0);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const debounceRef = useRef<number | null>(null);
  const lastEmittedRef = useRef<Hex>(value);

  // Sync external value -> local text when the parent updates the hex
  // (e.g., a random click or external navigation).
  useEffect(() => {
    if (value !== lastEmittedRef.current) {
      setText(value);
      lastEmittedRef.current = value;
      setHasError(false);
    }
  }, [value]);

  const tryEmit = useCallback(
    (raw: string) => {
      try {
        const hex = parseColor(raw);
        setHasError(false);
        if (hex !== lastEmittedRef.current) {
          lastEmittedRef.current = hex;
          onChange(hex);
        }
      } catch {
        setHasError(true);
      }
    },
    [onChange],
  );

  const onTextChange = useCallback(
    (next: string) => {
      setText(next);
      setSuggestions(findSuggestions(next));
      setShowSuggestions(true);
      setActiveSuggestion(0);
      if (debounceRef.current !== null) {
        window.clearTimeout(debounceRef.current);
      }
      debounceRef.current = window.setTimeout(() => {
        tryEmit(next);
      }, DEBOUNCE_MS);
    },
    [tryEmit],
  );

  // Cleanup pending debounce on unmount.
  useEffect(() => {
    return () => {
      if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
    };
  }, []);

  const acceptSuggestion = useCallback(
    (s: NamedColorSlim) => {
      setText(s.slug);
      setShowSuggestions(false);
      // Cancel pending debounce and emit immediately for snappy UX on accept.
      if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
      lastEmittedRef.current = s.hex;
      setHasError(false);
      onChange(s.hex);
    },
    [onChange],
  );

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (showSuggestions && suggestions.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setActiveSuggestion(i => Math.min(i + 1, suggestions.length - 1));
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setActiveSuggestion(i => Math.max(i - 1, 0));
          return;
        }
        if (e.key === 'Enter') {
          e.preventDefault();
          acceptSuggestion(suggestions[activeSuggestion]);
          return;
        }
        if (e.key === 'Escape') {
          setShowSuggestions(false);
          return;
        }
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
        tryEmit(text);
      }
    },
    [showSuggestions, suggestions, activeSuggestion, acceptSuggestion, tryEmit, text],
  );

  const onRandom = useCallback(() => {
    const n = POPULAR_HEXES.length;
    if (n === 0) return;
    const pick = POPULAR_HEXES[Math.floor(Math.random() * n)];
    onChange(pick);
  }, [onChange]);

  const onPicker = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      // <input type="color"> always returns lowercase '#rrggbb'.
      onChange(e.target.value as Hex);
    },
    [onChange],
  );

  const inputBorderClass = hasError
    ? 'border-accent'
    : 'border-ink/20 focus-within:border-ink';

  const inputId = useMemo(() => 'shade-tool-color-input', []);

  return (
    <div className="relative flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <span className="eyebrow">Color</span>
        <div className={`flex items-stretch gap-0 border ${inputBorderClass} bg-paper transition-colors`}>
          {/* Native color swatch (left) */}
          <label
            className="flex w-12 shrink-0 cursor-pointer items-center justify-center border-r border-ink/15"
            title="Pick a color"
            style={{ backgroundColor: value }}
          >
            <span className="sr-only">Color picker</span>
            <input
              type="color"
              value={value}
              onChange={onPicker}
              className="h-0 w-0 opacity-0"
              aria-label="Open color picker"
            />
          </label>

          <div className="relative flex-1">
            <input
              id={inputId}
              type="text"
              value={text}
              onChange={(e) => onTextChange(e.target.value)}
              onKeyDown={onKeyDown}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => {
                window.setTimeout(() => setShowSuggestions(false), 120);
              }}
              spellCheck={false}
              autoComplete="off"
              autoCapitalize="off"
              aria-label="Color value"
              aria-invalid={hasError || undefined}
              placeholder="#4040ff, coral, rgb(64 64 255)"
              className={
                'w-full bg-transparent px-3 py-2.5 font-mono text-sm tracking-tight text-ink ' +
                'placeholder:text-mute/70 focus:outline-none'
              }
            />
          </div>

          <button
            type="button"
            onClick={onRandom}
            title="Random color"
            aria-label="Random color"
            className={
              'flex w-12 shrink-0 items-center justify-center border-l border-ink/15 ' +
              'text-ink/70 hover:text-accent hover:bg-paper-2 ' +
              'focus-visible:outline-none focus-visible:bg-accent-soft'
            }
          >
            <DiceIcon />
          </button>
        </div>

        {showSuggestions && suggestions.length > 0 && (
          <ul
            role="listbox"
            className="absolute left-0 right-0 top-full z-20 mt-1 max-h-60 overflow-auto border border-ink/15 bg-paper shadow-[0_8px_24px_rgba(17,17,16,0.08)]"
          >
            {suggestions.map((s, i) => (
              <li
                key={s.slug}
                role="option"
                aria-selected={i === activeSuggestion}
                onMouseDown={(e) => {
                  e.preventDefault();
                  acceptSuggestion(s);
                }}
                onMouseEnter={() => setActiveSuggestion(i)}
                className={[
                  'flex cursor-pointer items-center gap-3 px-3 py-2 text-sm',
                  i === activeSuggestion ? 'bg-paper-2' : '',
                ].join(' ')}
              >
                <span
                  aria-hidden="true"
                  className="inline-block h-5 w-5 rounded-sm ring-1 ring-ink/10"
                  style={{ backgroundColor: s.hex }}
                />
                <span className="font-display italic text-ink">{s.name ?? s.slug}</span>
                <span className="ml-auto font-mono text-xs text-mute">{s.hex}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function DiceIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="h-4 w-4">
      <rect x="2.5" y="2.5" width="11" height="11" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.25" />
      <circle cx="5.5" cy="5.5" r="0.9" fill="currentColor" />
      <circle cx="10.5" cy="5.5" r="0.9" fill="currentColor" />
      <circle cx="8" cy="8" r="0.9" fill="currentColor" />
      <circle cx="5.5" cy="10.5" r="0.9" fill="currentColor" />
      <circle cx="10.5" cy="10.5" r="0.9" fill="currentColor" />
    </svg>
  );
}
