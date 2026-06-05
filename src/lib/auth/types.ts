import type { CopyFormat, ExportFormat, Hex } from '../color/types';

export type OAuthProvider = 'google' | 'github';

export interface User {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  createdAt: number;
  plan: 'free' | 'pro';
  planUntil: number | null;
}

/**
 * A saved preset. Mirrors the design-relevant island prefs; transient UI state
 * (channelFormat, dismissedHintBanner) is intentionally excluded.
 */
export interface Preset {
  id: string;
  name: string;
  hex: Hex;
  view: 'scale' | 'ramp';
  copyFormat: CopyFormat;
  exportFormat?: ExportFormat;
}

/** A user's billing plan. `'free'` is the default for everyone in v1. */
export type Plan = 'free' | 'pro';

/** Palette visibility. `'private'` is an inert future-Pro seam in v1. */
export type PaletteVisibility = 'public' | 'private';

/** Semantic role a palette color plays in mock previews. */
export type PaletteRole = 'bg' | 'surface' | 'accent' | 'text' | 'extra';

/**
 * One color in a palette. Mirrors a `palette_colors` row: the canonical hex,
 * the per-color view/copy prefs (reused by the single-color tool), an optional
 * semantic role, and the precomputed OKLCH hue bucket for the color filter.
 */
export interface PaletteColor {
  position: number;
  hex: Hex;
  view: 'scale' | 'ramp';
  copyFormat: CopyFormat;
  role: PaletteRole | null;
  hueBucket: number | null;
}

/**
 * A full palette with its ordered colors. Returned by the owner editor and the
 * public `/p/[slug]` page (visibility-gated upstream).
 */
export interface Palette {
  id: string;
  name: string;
  slug: string;
  visibility: PaletteVisibility;
  description: string | null;
  tags: string[];
  flagged: boolean;
  viewCount: number;
  voteCount: number;
  featured: boolean;
  createdAt: number;
  updatedAt: number;
  colors: PaletteColor[];
}

/**
 * Lightweight palette shape for list/explore cards: no full color objects (just
 * the hex strings for swatch bands), plus the vote tally and whether the current
 * viewer has voted.
 */
export interface PaletteSummary {
  id: string;
  name: string;
  slug: string;
  visibility: PaletteVisibility;
  voteCount: number;
  votedByMe: boolean;
  featured: boolean;
  createdAt: number;
  colors: Hex[];
}

/**
 * Paginated public listing returned by `listPublicPalettes` (and surfaced by
 * `GET /api/explore`). `nextCursor` is an opaque, base64-encoded keyset token
 * to pass back as `?cursor=` for the next page; `null` when the last page has
 * been reached.
 */
export interface ExploreResponse {
  items: PaletteSummary[];
  nextCursor: string | null;
}

/** Shape returned by GET /api/me. */
export interface MeResponse {
  user: Pick<User, 'email' | 'name' | 'avatarUrl'> | null;
  presets: Preset[];
  plan: Plan;
}
