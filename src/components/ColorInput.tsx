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
import { NAMED_COLORS, type NamedColor } from '../lib/data/named-colors';
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
 *   - An EyeDropper button (conditional on `'EyeDropper' in window`)
 *
 * Autocomplete: once ≥ 2 chars match a named-color slug prefix we render
 * a small dropdown. Arrow keys move focus; Enter / click accepts.
 */

declare global {
  interface Window {
    EyeDropper?: new () => { open(): Promise<{ sRGBHex: string }> };
  }
}

export interface ColorInputProps {
  value: Hex;
  onChange: (next: Hex) => void;
}

const DEBOUNCE_MS = 250;
const MAX_SUGGESTIONS = 6;

function findSuggestions(query: string): NamedColor[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  return NAMED_COLORS
    .filter(c => c.slug.startsWith(q) || c.name.toLowerCase().startsWith(q))
    .slice(0, MAX_SUGGESTIONS);
}

export default function ColorInput({ value, onChange }: ColorInputProps) {
  // Local text mirrors what the user is typing. We don't force-sync it to
  // `value` on every keystroke; we only sync when `value` changes from the
  // outside (e.g., random button, eyedropper, or external navigation).
  const [text, setText] = useState<string>(value);
  const [hasError, setHasError] = useState(false);
  const [hasEyeDropper, setHasEyeDropper] = useState(false);
  const [suggestions, setSuggestions] = useState<NamedColor[]>([]);
  const [activeSuggestion, setActiveSuggestion] = useState(0);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const debounceRef = useRef<number | null>(null);
  const lastEmittedRef = useRef<Hex>(value);

  // Sync external value -> local text when the parent updates the hex
  // (e.g., a random click, navigation, eyedropper).
  useEffect(() => {
    if (value !== lastEmittedRef.current) {
      setText(value);
      lastEmittedRef.current = value;
      setHasError(false);
    }
  }, [value]);

  // Feature-detect EyeDropper after mount (SSR safety).
  useEffect(() => {
    if (typeof window !== 'undefined' && 'EyeDropper' in window) {
      setHasEyeDropper(true);
    }
  }, []);

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
    (s: NamedColor) => {
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

  const onEyeDropper = useCallback(async () => {
    if (typeof window === 'undefined' || !window.EyeDropper) return;
    try {
      const result = await new window.EyeDropper().open();
      const hex = result.sRGBHex.toLowerCase() as Hex;
      onChange(hex);
    } catch {
      /* user cancelled */
    }
  }, [onChange]);

  const inputRingClass = hasError
    ? 'ring-2 ring-red-500/70'
    : 'ring-1 ring-neutral-300 dark:ring-neutral-700';

  const inputId = useMemo(() => 'shade-tool-color-input', []);

  return (
    <div className="relative flex flex-col gap-2">
      <div className="flex items-stretch gap-2">
        <div className="relative flex-1">
          <input
            id={inputId}
            type="text"
            value={text}
            onChange={(e) => onTextChange(e.target.value)}
            onKeyDown={onKeyDown}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => {
              // Delay so a click on a suggestion item can register first.
              window.setTimeout(() => setShowSuggestions(false), 120);
            }}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            aria-label="Color value"
            aria-invalid={hasError || undefined}
            placeholder="#4040ff, coral, rgb(...), oklch(...)"
            className={[
              'w-full rounded-md bg-white px-3 py-2 font-mono text-sm text-neutral-900',
              'dark:bg-neutral-900 dark:text-neutral-100',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
              inputRingClass,
            ].join(' ')}
          />

          {showSuggestions && suggestions.length > 0 && (
            <ul
              role="listbox"
              className={
                'absolute left-0 right-0 top-full z-20 mt-1 max-h-60 overflow-auto rounded-md ' +
                'border border-neutral-200 bg-white shadow-lg ' +
                'dark:border-neutral-700 dark:bg-neutral-900'
              }
            >
              {suggestions.map((s, i) => (
                <li
                  key={s.slug}
                  role="option"
                  aria-selected={i === activeSuggestion}
                  onMouseDown={(e) => {
                    // Use mousedown so it fires before the input's blur.
                    e.preventDefault();
                    acceptSuggestion(s);
                  }}
                  onMouseEnter={() => setActiveSuggestion(i)}
                  className={[
                    'flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm',
                    i === activeSuggestion
                      ? 'bg-neutral-100 dark:bg-neutral-800'
                      : '',
                  ].join(' ')}
                >
                  <span
                    aria-hidden="true"
                    className="inline-block h-4 w-4 rounded ring-1 ring-black/10"
                    style={{ backgroundColor: s.hex }}
                  />
                  <span className="font-mono text-xs text-neutral-500">{s.slug}</span>
                  <span className="ml-auto font-mono text-xs text-neutral-400">
                    {s.hex}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Native color swatch */}
        <label
          className="flex h-auto w-10 cursor-pointer items-center justify-center rounded-md ring-1 ring-neutral-300 dark:ring-neutral-700"
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

        <button
          type="button"
          onClick={onRandom}
          className={
            'rounded-md bg-neutral-900 px-3 py-2 text-xs font-medium text-white ' +
            'hover:bg-neutral-800 ' +
            'dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200 ' +
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500'
          }
        >
          Random
        </button>

        {hasEyeDropper && (
          <button
            type="button"
            onClick={onEyeDropper}
            aria-label="Pick color from screen"
            title="Pick color from screen"
            className={
              'rounded-md px-3 py-2 text-xs font-medium ring-1 ring-neutral-300 ' +
              'hover:bg-neutral-100 ' +
              'dark:ring-neutral-700 dark:hover:bg-neutral-800 ' +
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500'
            }
          >
            <EyeDropperIcon />
          </button>
        )}
      </div>
    </div>
  );
}

function EyeDropperIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="h-4 w-4">
      <path
        d="M10.5 1.5l4 4-2 2-1-1-5 5L4 13l-2 1 1-2 1.5-2.5 5-5-1-1 2-2z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
    </svg>
  );
}
