/**
 * Pure palette → scoped-CSS-vars mapping for the mock previews.
 *
 * This module is intentionally free of any DOM / React dependency so it can run
 * **server-side** - `/p/[slug]` renders the Cards mock in its hero and the OG
 * image endpoint reuses the same `MockVars` to colour its strip. The browser
 * `MockPreview` island calls the very same helper, so client and server agree
 * byte-for-byte.
 *
 * Role mapping (the contract):
 *   - explicit `role` on a color wins (`bg | surface | accent | text | extra`);
 *   - otherwise roles fall back by position: `[0]→bg, [1]→surface, [2]→accent,
 *     [3]→text, rest→extra`;
 *   - any slot left unfilled gets a sensible default derived from the others;
 *   - if the chosen `text` fails WCAG AA on `bg`, it is auto-replaced with the
 *     readable end of the mono ramp via `contrast.ts` - so a mock is never
 *     unreadable regardless of which colors the user picked.
 */
import { contrastRatio } from '../../lib/color/contrast';
import { parseColor } from '../../lib/color/parse';
import type { Hex } from '../../lib/color/types';
import type { MockColorInput, MockVars } from './types';

const WHITE = '#ffffff' as Hex;
const BLACK = '#0a0a0a' as Hex;

/** WCAG AA for normal text; below this we auto-pick a readable `text`. */
const MIN_TEXT_CONTRAST = 4.5;

/** Roles we resolve to a single slot, in stage-var order. */
type CoreRole = 'bg' | 'surface' | 'accent' | 'text';
const POSITION_ROLES: readonly CoreRole[] = ['bg', 'surface', 'accent', 'text'];

interface ResolvedRoles {
  bg: Hex;
  surface: Hex;
  accent: Hex;
  text: Hex;
  extras: Hex[];
}

/** The black/white that reads best on `bg` - mirrors ShadeRow's foreground rule. */
function readableOn(bg: Hex): Hex {
  return contrastRatio(bg, WHITE) >= contrastRatio(bg, BLACK) ? WHITE : BLACK;
}

/**
 * Resolve a palette's colors into the four core role slots + extras.
 *
 * Exported for the unit test: this is the role-fallback logic in isolation. All
 * inputs are run through `parseColor` so a malformed hex can't reach the CSS.
 */
export function resolveRoles(colors: MockColorInput[]): ResolvedRoles {
  const safe = colors
    .map((c) => {
      try {
        return { hex: parseColor(c.hex), role: c.role ?? null };
      } catch {
        return null;
      }
    })
    .filter((c): c is { hex: Hex; role: string | null } => c !== null);

  // Slot assignment: explicit role first, then by position for unroled colors.
  const byRole: Partial<Record<CoreRole, Hex>> = {};
  const extras: Hex[] = [];
  const unroled: Hex[] = [];

  for (const { hex, role } of safe) {
    if (role && (POSITION_ROLES as readonly string[]).includes(role)) {
      const r = role as CoreRole;
      if (byRole[r] === undefined) byRole[r] = hex;
      else extras.push(hex);
    } else if (role === 'extra') {
      extras.push(hex);
    } else {
      unroled.push(hex);
    }
  }

  // Fill still-empty core slots from the unroled colors, by position order.
  for (const role of POSITION_ROLES) {
    if (byRole[role] === undefined && unroled.length > 0) {
      byRole[role] = unroled.shift();
    }
  }
  // Anything left over after the four core slots are full becomes an extra.
  extras.push(...unroled);

  // Defaults for slots no color filled. `bg` defaults to white paper; the
  // others derive from whatever we do have so the mock is always coherent.
  const bg = byRole.bg ?? WHITE;
  const surface = byRole.surface ?? bg;
  const accent = byRole.accent ?? byRole.text ?? readableOn(bg);
  let text = byRole.text ?? readableOn(bg);

  // Auto-pick a readable text color if the chosen one fails AA on the bg.
  if (contrastRatio(text, bg) < MIN_TEXT_CONTRAST) {
    text = readableOn(bg);
  }

  return { bg, surface, accent, text, extras };
}

/** Mix two hexes in sRGB by `t` (0 → a, 1 → b). Cheap, gamut-safe. */
function mix(a: Hex, b: Hex, t: number): Hex {
  const pa = hexToRgb(a);
  const pb = hexToRgb(b);
  const ch = (x: number, y: number) => Math.round(x + (y - x) * t);
  return rgbToHex(ch(pa[0], pb[0]), ch(pa[1], pb[1]), ch(pa[2], pb[2]));
}

function hexToRgb(hex: Hex): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r: number, g: number, b: number): Hex {
  const h = (v: number) => v.toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}` as Hex;
}

/**
 * Map a palette to the scoped `--mock-*` vars consumed by every template.
 *
 * Pure and SSR-safe - the canonical entry point reused by the `/p/[slug]` hero
 * and the OG endpoint. Pass the palette's colors (with optional roles); get a
 * `style`-ready var object.
 */
export function computeMockVars(colors: MockColorInput[]): MockVars {
  const { bg, surface, accent, text, extras } = resolveRoles(colors);
  const onAccent = readableOn(accent);

  // Chart series: accent first, then any extras, then the surface/text spread,
  // always five entries so `--mock-chart-0..4` are all defined.
  const series: Hex[] = [accent, ...extras, mix(accent, text, 0.4), surface, mix(accent, bg, 0.5)];
  const chart = (i: number): Hex => series[i] ?? series[i % series.length] ?? accent;

  return {
    '--mock-bg': bg,
    '--mock-surface': surface,
    '--mock-accent': accent,
    '--mock-text': text,
    '--mock-muted': mix(text, surface, 0.45),
    '--mock-border': mix(text, surface, 0.82),
    '--mock-on-accent': onAccent,
    '--mock-chip': mix(accent, surface, 0.78),
    '--mock-chart-0': chart(0),
    '--mock-chart-1': chart(1),
    '--mock-chart-2': chart(2),
    '--mock-chart-3': chart(3),
    '--mock-chart-4': chart(4),
  };
}
