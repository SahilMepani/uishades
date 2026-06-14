/**
 * D1 data access for auth + presets. Every function takes the `DB` binding as
 * its first argument (dependency injection) so the logic is unit-testable with
 * a mocked D1 - this module never imports `cloudflare:workers`.
 *
 * `findOrCreateUserByEmail` is the account-linking rule: a *verified* email is
 * the single identity key across Google, GitHub, and magic link. Callers MUST
 * have verified the email first (see the OAuth callbacks' verified-email gate).
 */
import { hueBucket } from '../color/hue';
import type { CopyFormat, ExportFormat, Hex } from '../color/types';
import { normalizeEmail } from './normalize';
import type {
  OAuthProvider,
  Palette,
  PaletteColor,
  PaletteRole,
  PaletteSummary,
  PaletteVisibility,
  Preset,
  ExploreResponse,
  User,
} from './types';

interface UserRow {
  id: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
  created_at: number;
  // Added in 0004; older rows / mocked-D1 selects may omit these, so the mapper
  // tolerates `undefined` and falls back to the migration defaults.
  plan?: string | null;
  plan_until?: number | null;
}

/** Columns selected wherever a full `User` is materialized. */
const USER_COLS = 'id, email, name, avatar_url, created_at, plan, plan_until';

function toUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    avatarUrl: row.avatar_url,
    createdAt: row.created_at,
    plan: row.plan === 'pro' ? 'pro' : 'free',
    planUntil: row.plan_until ?? null,
  };
}

export async function findUserByEmail(db: D1Database, email: string): Promise<User | null> {
  const row = await db
    .prepare(`SELECT ${USER_COLS} FROM users WHERE email = ?`)
    .bind(normalizeEmail(email))
    .first<UserRow>();
  return row ? toUser(row) : null;
}

export async function getUserById(db: D1Database, id: string): Promise<User | null> {
  const row = await db
    .prepare(`SELECT ${USER_COLS} FROM users WHERE id = ?`)
    .bind(id)
    .first<UserRow>();
  return row ? toUser(row) : null;
}

interface NewUser {
  email: string;
  name?: string | null;
  avatarUrl?: string | null;
}

async function createUser(db: D1Database, input: NewUser): Promise<User> {
  const user: User = {
    id: crypto.randomUUID(),
    email: normalizeEmail(input.email),
    name: input.name ?? null,
    avatarUrl: input.avatarUrl ?? null,
    createdAt: Date.now(),
    plan: 'free',
    planUntil: null,
  };
  // `plan`/`plan_until` fall to their migration defaults (free / NULL) - only the
  // original five columns are written here.
  await db
    .prepare('INSERT INTO users (id, email, name, avatar_url, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(user.id, user.email, user.name, user.avatarUrl, user.createdAt)
    .run();
  return user;
}

/**
 * Look up the user by verified email; create if absent. On the rare insert race
 * (two concurrent first-logins for the same email), the UNIQUE(email) constraint
 * rejects the loser, so we re-select and return the winner's row.
 */
export async function findOrCreateUserByEmail(db: D1Database, input: NewUser): Promise<User> {
  const existing = await findUserByEmail(db, input.email);
  if (existing) return existing;
  try {
    return await createUser(db, input);
  } catch (err) {
    // If this was the UNIQUE(email) insert race, the winner is now selectable.
    const raced = await findUserByEmail(db, input.email);
    if (raced) return raced;
    // Otherwise it was a genuine failure (transient write error, etc.) - surface
    // the real cause instead of masking it behind a generic message.
    throw err;
  }
}

/**
 * Insert the provider→user link. `DO NOTHING` (not `DO UPDATE SET user_id`) is
 * deliberate: once a provider account is bound to a user it must NOT be silently
 * re-pointed at a different user (that orphans the original user + their presets
 * when the provider's email later changes). `resolveOAuthUser` only inserts when
 * no link exists, so the conflict clause here is just race protection.
 */
export async function upsertOAuthAccount(
  db: D1Database,
  account: { provider: OAuthProvider; providerUserId: string; userId: string },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO oauth_accounts (provider, provider_user_id, user_id) VALUES (?, ?, ?)
       ON CONFLICT (provider, provider_user_id) DO NOTHING`,
    )
    .bind(account.provider, account.providerUserId, account.userId)
    .run();
}

/** The user this provider account is already bound to, if any. */
export async function findUserIdByOAuthAccount(
  db: D1Database,
  provider: OAuthProvider,
  providerUserId: string,
): Promise<string | null> {
  const row = await db
    .prepare('SELECT user_id FROM oauth_accounts WHERE provider = ? AND provider_user_id = ?')
    .bind(provider, providerUserId)
    .first<{ user_id: string }>();
  return row?.user_id ?? null;
}

/**
 * Resolve the user for a verified OAuth login. A *returning* user is matched by
 * the provider's stable account id first, so a later change to their provider
 * email keeps them on the same account (with its presets) instead of stranding
 * it. Only a brand-new provider account falls through to the verified-email
 * linking key - which is what lets a second provider attach to an existing
 * same-email account (the documented cross-provider model).
 */
export async function resolveOAuthUser(
  db: D1Database,
  account: { provider: OAuthProvider; providerUserId: string },
  profile: NewUser,
): Promise<User> {
  const linkedId = await findUserIdByOAuthAccount(db, account.provider, account.providerUserId);
  if (linkedId) {
    const existing = await getUserById(db, linkedId);
    if (existing) return existing;
  }
  const user = await findOrCreateUserByEmail(db, profile);
  await upsertOAuthAccount(db, { ...account, userId: user.id });
  return user;
}

// --- Magic-link tokens -------------------------------------------------------

export async function storeMagicToken(
  db: D1Database,
  token: { tokenHash: string; email: string; expiresAt: number },
): Promise<void> {
  await db
    .prepare('INSERT INTO magic_link_tokens (token_hash, email, expires_at) VALUES (?, ?, ?)')
    .bind(token.tokenHash, normalizeEmail(token.email), token.expiresAt)
    .run();
}

/** Delete a stored token (used to clean up after a failed email send). */
export async function deleteMagicToken(db: D1Database, tokenHash: string): Promise<void> {
  await db.prepare('DELETE FROM magic_link_tokens WHERE token_hash = ?').bind(tokenHash).run();
}

/**
 * Look up a token WITHOUT consuming it - for the GET confirm step, which must be
 * safe to hit repeatedly (email scanners/prefetchers issue a GET on delivery).
 * Returns the email only if the token exists and hasn't expired.
 */
export async function peekMagicToken(db: D1Database, tokenHash: string): Promise<string | null> {
  const row = await db
    .prepare('SELECT email, expires_at FROM magic_link_tokens WHERE token_hash = ?')
    .bind(tokenHash)
    .first<{ email: string; expires_at: number }>();
  if (!row) return null;
  if (row.expires_at < Date.now()) return null;
  return row.email;
}

/**
 * Single-use consume: atomically delete the row and return what was deleted.
 * `DELETE ... RETURNING` is one statement, so two concurrent consumes of the
 * same token can't both observe it - enforcing single-use even under a race.
 * Return the email only if the row existed and hadn't expired.
 */
export async function consumeMagicToken(db: D1Database, tokenHash: string): Promise<string | null> {
  const row = await db
    .prepare('DELETE FROM magic_link_tokens WHERE token_hash = ? RETURNING email, expires_at')
    .bind(tokenHash)
    .first<{ email: string; expires_at: number }>();
  if (!row) return null;
  if (row.expires_at < Date.now()) return null;
  return row.email;
}

/** Garbage-collect expired magic tokens (requested-but-never-clicked links). */
export async function pruneExpiredMagicTokens(db: D1Database, nowMs: number): Promise<void> {
  await db.prepare('DELETE FROM magic_link_tokens WHERE expires_at < ?').bind(nowMs).run();
}

// --- Magic-link rate limiting ------------------------------------------------

export async function countRecentMagicRequests(
  db: D1Database,
  key: string,
  sinceMs: number,
): Promise<number> {
  const row = await db
    .prepare('SELECT COUNT(*) AS n FROM magic_link_requests WHERE key = ? AND created_at >= ?')
    .bind(key, sinceMs)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

// Returns the inserted rowid so a record-then-check limiter can roll back a
// just-recorded attempt (see api/auth/magic.ts). Callers that ignore the return
// stay correct.
export async function recordMagicRequest(db: D1Database, key: string, at: number): Promise<number> {
  const res = await db
    .prepare('INSERT INTO magic_link_requests (key, created_at) VALUES (?, ?)')
    .bind(key, at)
    .run();
  return res.meta.last_row_id as number;
}

export async function deleteMagicRequestById(db: D1Database, id: number): Promise<void> {
  await db.prepare('DELETE FROM magic_link_requests WHERE rowid = ?').bind(id).run();
}

export async function pruneMagicRequests(db: D1Database, beforeMs: number): Promise<void> {
  // Scope the prune away from the `report:<id>` tally rows: the report endpoint
  // keeps those forever (count-across-all-time threshold), so wiping them by
  // `created_at` would let slow legitimate reports never reach the flag count.
  // `report-ip:` rows start "report-" (not "report:"), so they DON'T match
  // 'report:%' and are still pruned here, along with `email:`/`ip:`/`fb-ip:`/
  // `magic:` rows. Only the `report:<id>` tally is preserved.
  await db
    .prepare("DELETE FROM magic_link_requests WHERE created_at < ? AND key NOT LIKE 'report:%'")
    .bind(beforeMs)
    .run();
}

// --- Presets -----------------------------------------------------------------

interface PresetRow {
  id: string;
  name: string;
  hex: string;
  view: string;
  copy_format: string | null;
  export_format: string | null;
}

function toPreset(row: PresetRow): Preset {
  return {
    id: row.id,
    name: row.name,
    hex: row.hex as Hex,
    view: row.view === 'ramp' ? 'ramp' : 'scale',
    copyFormat: (row.copy_format ?? 'hex') as CopyFormat,
    exportFormat: (row.export_format ?? undefined) as ExportFormat | undefined,
  };
}

export async function listPresets(db: D1Database, userId: string): Promise<Preset[]> {
  const { results } = await db
    .prepare(
      `SELECT id, name, hex, view, copy_format, export_format
       FROM presets WHERE user_id = ? ORDER BY created_at DESC`,
    )
    .bind(userId)
    .all<PresetRow>();
  return (results ?? []).map(toPreset);
}

/** Count a user's presets without materializing the rows (for the limit check). */
export async function countPresets(db: D1Database, userId: string): Promise<number> {
  const row = await db
    .prepare('SELECT COUNT(*) AS n FROM presets WHERE user_id = ?')
    .bind(userId)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

export async function createPreset(
  db: D1Database,
  userId: string,
  input: Omit<Preset, 'id'>,
): Promise<Preset> {
  const id = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO presets (id, user_id, name, hex, view, copy_format, export_format, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      userId,
      input.name,
      input.hex,
      input.view,
      input.copyFormat,
      input.exportFormat ?? null,
      Date.now(),
    )
    .run();
  return { id, ...input };
}

/** Scoped delete - a user can only delete their own presets. */
export async function deletePreset(db: D1Database, userId: string, id: string): Promise<boolean> {
  const res = await db
    .prepare('DELETE FROM presets WHERE id = ? AND user_id = ?')
    .bind(id, userId)
    .run();
  return (res.meta?.changes ?? 0) > 0;
}

// --- Billing seam ------------------------------------------------------------

/**
 * Inert leftover from an abandoned paywall plan (monetization dropped 2026-06-14
 * — the site is free forever; see `docs/audience-roadmap.md`). Called nowhere
 * user-facing; everyone is `'free'` by migration default. Kept (with its tests)
 * only because removing it churns the schema for no benefit — do NOT build new
 * gates on it. A user is "Pro" only while plan is `'pro'` AND the window holds.
 */
export function isPro(user: Pick<User, 'plan' | 'planUntil'>): boolean {
  return user.plan === 'pro' && (user.planUntil ?? 0) > Date.now();
}

// --- Palettes ----------------------------------------------------------------

interface PaletteRow {
  id: string;
  user_id: string;
  name: string;
  slug: string;
  visibility: string;
  description: string | null;
  tags: string | null;
  flagged: number;
  view_count: number;
  vote_count: number;
  featured: number;
  featured_at: number | null;
  created_at: number;
  updated_at: number;
}

interface PaletteColorRow {
  palette_id: string;
  position: number;
  hex: string;
  view: string;
  copy_format: string | null;
  role: string | null;
  hue_bucket: number | null;
}

const ROLE_VALUES: readonly PaletteRole[] = ['bg', 'surface', 'accent', 'text', 'extra'] as const;

function toVisibility(v: string): PaletteVisibility {
  return v === 'private' ? 'private' : 'public';
}

function toRole(r: string | null): PaletteRole | null {
  return r && (ROLE_VALUES as readonly string[]).includes(r) ? (r as PaletteRole) : null;
}

function parseTags(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === 'string') : [];
  } catch {
    return [];
  }
}

function toPaletteColor(row: PaletteColorRow): PaletteColor {
  return {
    position: row.position,
    hex: row.hex as Hex,
    view: row.view === 'ramp' ? 'ramp' : 'scale',
    copyFormat: (row.copy_format ?? 'hex') as CopyFormat,
    role: toRole(row.role),
    hueBucket: row.hue_bucket ?? null,
  };
}

function toPalette(row: PaletteRow, colors: PaletteColor[]): Palette {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    visibility: toVisibility(row.visibility),
    description: row.description,
    tags: parseTags(row.tags),
    flagged: row.flagged !== 0,
    viewCount: row.view_count,
    voteCount: row.vote_count,
    featured: row.featured !== 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    colors: [...colors].sort((a, b) => a.position - b.position),
  };
}

/**
 * Auto-assign a semantic role by position when the caller didn't supply one:
 * `[0]→bg, [1]→surface, [2]→accent, [3]→text, rest→extra`. Matches the
 * editor's "shuffle roles" default and the mock-preview var mapping.
 */
function roleForPosition(position: number): PaletteRole {
  return ROLE_VALUES[position] ?? 'extra';
}

const PALETTE_SELECT = `
  SELECT p.id, p.user_id, p.name, p.slug, p.visibility, p.description, p.tags,
         p.flagged, p.view_count, p.vote_count, p.featured, p.featured_at,
         p.created_at, p.updated_at
  FROM palettes p`;

export interface NewPaletteColor {
  hex: Hex;
  view?: 'scale' | 'ramp';
  copyFormat?: CopyFormat;
  role?: PaletteRole | null;
}

export interface NewPalette {
  name: string;
  slug: string;
  visibility?: PaletteVisibility;
  description?: string | null;
  tags?: string[];
  colors: NewPaletteColor[];
}

/**
 * Insert a palette and its colors. Each color's `hue_bucket` is computed here
 * via `hueBucket(hex)` (the indexed color-filter key) and roles default by
 * position. The palette row + all color rows go in one `db.batch` so a partial
 * write can't leave a palette without its colors.
 */
export async function createPalette(
  db: D1Database,
  userId: string,
  input: NewPalette,
): Promise<Palette> {
  const id = crypto.randomUUID();
  const now = Date.now();
  const visibility: PaletteVisibility = input.visibility === 'private' ? 'private' : 'public';
  const tagsJson = input.tags && input.tags.length > 0 ? JSON.stringify(input.tags) : null;

  const colors: PaletteColor[] = input.colors.map((c, position) => ({
    position,
    hex: c.hex,
    view: c.view === 'ramp' ? 'ramp' : 'scale',
    copyFormat: c.copyFormat ?? 'hex',
    role: c.role ?? roleForPosition(position),
    hueBucket: hueBucket(c.hex),
  }));

  const statements = [
    db
      .prepare(
        `INSERT INTO palettes
           (id, user_id, name, slug, visibility, description, tags, flagged,
            view_count, vote_count, featured, featured_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0, NULL, ?, ?)`,
      )
      .bind(
        id,
        userId,
        input.name,
        input.slug,
        visibility,
        input.description ?? null,
        tagsJson,
        now,
        now,
      ),
    ...colors.map((c) =>
      db
        .prepare(
          `INSERT INTO palette_colors
             (palette_id, position, hex, view, copy_format, role, hue_bucket)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(id, c.position, c.hex, c.view, c.copyFormat, c.role, c.hueBucket),
    ),
  ];
  await db.batch(statements);

  return {
    id,
    name: input.name,
    slug: input.slug,
    visibility,
    description: input.description ?? null,
    tags: input.tags ?? [],
    flagged: false,
    viewCount: 0,
    voteCount: 0,
    featured: false,
    createdAt: now,
    updatedAt: now,
    colors,
  };
}

/** Read a palette's color rows, ordered by position. */
async function readPaletteColors(db: D1Database, paletteId: string): Promise<PaletteColor[]> {
  const { results } = await db
    .prepare(
      `SELECT palette_id, position, hex, view, copy_format, role, hue_bucket
       FROM palette_colors WHERE palette_id = ? ORDER BY position ASC`,
    )
    .bind(paletteId)
    .all<PaletteColorRow>();
  return (results ?? []).map(toPaletteColor);
}

/** All of a user's palettes (public + private) as card summaries, newest first. */
export async function listPalettesByUser(
  db: D1Database,
  userId: string,
): Promise<PaletteSummary[]> {
  const { results } = await db
    .prepare(`${PALETTE_SELECT} WHERE p.user_id = ? ORDER BY p.created_at DESC`)
    .bind(userId)
    .all<PaletteRow>();
  return summarize(db, results ?? [], null);
}

/** A full palette by id (owner editor + internal reads). NULL if not found. */
export async function getPaletteWithColors(db: D1Database, id: string): Promise<Palette | null> {
  const row = await db.prepare(`${PALETTE_SELECT} WHERE p.id = ?`).bind(id).first<PaletteRow>();
  if (!row) return null;
  return toPalette(row, await readPaletteColors(db, id));
}

/**
 * A full palette by its stable public slug - returned only if the palette is
 * `public` (and not flagged) OR the caller is its owner. Pass `viewerId` to
 * grant owner access; omit it for anonymous public reads. NULL otherwise.
 */
export async function getPaletteBySlug(
  db: D1Database,
  slug: string,
  viewerId?: string | null,
): Promise<Palette | null> {
  const row = await db
    .prepare(`${PALETTE_SELECT} WHERE p.slug = ?`)
    .bind(slug)
    .first<PaletteRow>();
  if (!row) return null;
  const isOwner = viewerId != null && row.user_id === viewerId;
  const isPublic = toVisibility(row.visibility) === 'public' && row.flagged === 0;
  if (!isOwner && !isPublic) return null;
  return toPalette(row, await readPaletteColors(db, row.id));
}

export interface PalettePatch {
  name?: string;
  description?: string | null;
  tags?: string[];
  visibility?: PaletteVisibility;
  colors?: NewPaletteColor[];
}

/**
 * Owner-scoped update. Renames / re-describes / re-tags, and - when `colors` is
 * supplied - replaces the full color set (delete-then-insert, recomputing each
 * `hue_bucket` and re-defaulting roles by position). All writes run in one
 * `db.batch`. Returns the refreshed palette, or NULL if the caller doesn't own
 * a palette with that id. `updated_at` is bumped on every successful patch.
 *
 * NOTE: `visibility='private'` is accepted at the type level but the API route
 * rejects it — palettes are public-only (no privacy feature; monetization was
 * abandoned 2026-06-14, see `docs/audience-roadmap.md`). This helper itself
 * stays unopinionated so the policy lives in the route, not here.
 */
export async function updatePalette(
  db: D1Database,
  userId: string,
  id: string,
  patch: PalettePatch,
): Promise<Palette | null> {
  const existing = await db
    .prepare('SELECT id, user_id FROM palettes WHERE id = ? AND user_id = ?')
    .bind(id, userId)
    .first<{ id: string }>();
  if (!existing) return null;

  const now = Date.now();
  const sets: string[] = ['updated_at = ?'];
  const vals: unknown[] = [now];
  if (patch.name !== undefined) {
    sets.push('name = ?');
    vals.push(patch.name);
  }
  if (patch.description !== undefined) {
    sets.push('description = ?');
    vals.push(patch.description);
  }
  if (patch.tags !== undefined) {
    sets.push('tags = ?');
    vals.push(patch.tags.length > 0 ? JSON.stringify(patch.tags) : null);
  }
  if (patch.visibility !== undefined) {
    sets.push('visibility = ?');
    vals.push(patch.visibility);
  }

  const statements = [
    db.prepare(`UPDATE palettes SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`).bind(
      ...vals,
      id,
      userId,
    ),
  ];

  if (patch.colors !== undefined) {
    statements.push(db.prepare('DELETE FROM palette_colors WHERE palette_id = ?').bind(id));
    patch.colors.forEach((c, position) => {
      statements.push(
        db
          .prepare(
            `INSERT INTO palette_colors
               (palette_id, position, hex, view, copy_format, role, hue_bucket)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            id,
            position,
            c.hex,
            c.view === 'ramp' ? 'ramp' : 'scale',
            c.copyFormat ?? 'hex',
            c.role ?? roleForPosition(position),
            hueBucket(c.hex),
          ),
      );
    });
  }

  await db.batch(statements);
  return getPaletteWithColors(db, id);
}

/** Owner-scoped delete. ON DELETE CASCADE removes the palette's colors/votes. */
export async function deletePalette(db: D1Database, userId: string, id: string): Promise<boolean> {
  const res = await db
    .prepare('DELETE FROM palettes WHERE id = ? AND user_id = ?')
    .bind(id, userId)
    .run();
  return (res.meta?.changes ?? 0) > 0;
}

/** Fire-and-forget view counter for the public /p/[slug] page. */
export async function incrementPaletteView(db: D1Database, id: string): Promise<void> {
  await db.prepare('UPDATE palettes SET view_count = view_count + 1 WHERE id = ?').bind(id).run();
}

/** Count a user's palettes without materializing rows (for the save cap). */
export async function countPalettes(db: D1Database, userId: string): Promise<number> {
  const row = await db
    .prepare('SELECT COUNT(*) AS n FROM palettes WHERE user_id = ?')
    .bind(userId)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

/** Moderation: hide a palette from /explore (manual / report path). */
export async function flagPalette(db: D1Database, id: string): Promise<void> {
  await db.prepare('UPDATE palettes SET flagged = 1 WHERE id = ?').bind(id).run();
}

export type ExploreSort = 'top' | 'new' | 'trending' | 'featured';

/**
 * The `uishades` house account that owns every seeded/curated palette (see
 * `scripts/seed-explore-demo.mjs` and `scripts/seed-featured.mjs`). The public
 * `/explore` gallery shows ONLY palettes owned by this account - user-created
 * palettes never surface there. Keep this in sync with the seeders' `OWNER_ID`.
 */
export const SEED_OWNER_ID = 'seed00000-0000-4000-8000-000000000001';

export interface ListPublicOptions {
  sort?: ExploreSort;
  tag?: string;
  hueBucket?: number | null;
  cursor?: string | null;
  viewerId?: string | null;
  limit?: number;
}

/**
 * Opaque keyset cursor. It carries the tuple of the *last row of the previous
 * page* in the active sort's ordering, plus the `sort` it was minted for and -
 * for the time-sensitive `trending` sort - the reference `now` so every page of
 * a paginated session ranks against the same clock (otherwise the decayed score
 * would drift between requests and rows could repeat or vanish).
 *
 * The shape per sort:
 *   - new:      { s:'new',      ca, id }
 *   - top:      { s:'top',      vc, ca, id }
 *   - featured: { s:'featured', fa, id }
 *   - trending: { s:'trending', score, ca, id, now }
 *
 * Encoded as base64url(JSON). It is NOT signed - it only encodes public sort
 * positions, so tampering at worst returns a differently-positioned public page.
 */
interface NewCursor {
  s: 'new';
  ca: number;
  id: string;
}
interface TopCursor {
  s: 'top';
  vc: number;
  ca: number;
  id: string;
}
interface FeaturedCursor {
  s: 'featured';
  fa: number;
  id: string;
}
interface TrendingCursor {
  s: 'trending';
  score: number;
  ca: number;
  id: string;
  now: number;
}
type ExploreCursor = NewCursor | TopCursor | FeaturedCursor | TrendingCursor;

function encodeCursor(c: ExploreCursor): string {
  return btoa(JSON.stringify(c)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodeCursor(raw: string | null | undefined): ExploreCursor | null {
  if (!raw) return null;
  try {
    const b64 = raw.replace(/-/g, '+').replace(/_/g, '/');
    const parsed = JSON.parse(atob(b64)) as ExploreCursor;
    if (parsed && typeof parsed === 'object' && typeof parsed.s === 'string') return parsed;
    return null;
  } catch {
    return null;
  }
}

/** The recency-decayed "trending" score, mirroring the SQL expression below. */
function trendingScore(voteCount: number, createdAt: number, now: number): number {
  return voteCount / ((now - createdAt) / 3600000.0 + 2);
}

/**
 * Public gallery listing for /explore with **stable keyset (cursor) pagination**.
 * Only `public`, non-flagged palettes are returned. `sort`: `'top'`
 * (vote_count, then recency), `'new'` (created_at), `'trending'` (vote_count
 * decayed by age), `'featured'` (featured=1, featured_at). Each sort appends
 * `p.id` as a final, unique tiebreaker so the ordering is total and the keyset
 * comparison can't skip or repeat ties across pages. An optional `hueBucket`
 * joins `palette_colors` for the color filter; `tag` does a JSON-substring
 * match on the curated `tags`. When `viewerId` is present, each summary's
 * `votedByMe` reflects that user's vote.
 *
 * Returns `{ items, nextCursor }`: `nextCursor` is an opaque base64url token to
 * pass back as `opts.cursor` for the next page, or `null` at the end. A cursor
 * minted for a different `sort` is ignored (treated as the first page) so a sort
 * change in the UI resets pagination cleanly.
 */
export async function listPublicPalettes(
  db: D1Database,
  opts: ListPublicOptions = {},
): Promise<ExploreResponse> {
  // Default page size for the public gallery (/explore SSR first paint + the
  // /api/explore "Load more" feed). 20 per page; ExploreGrid appends via cursor.
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 60);
  const sort: ExploreSort = opts.sort ?? 'top';
  // Only seeded/curated palettes (owned by the house account) appear on
  // /explore - user-created palettes are never listed in the public gallery.
  const where: string[] = [
    "p.visibility = 'public'",
    'p.flagged = 0',
    'p.user_id = ?',
  ];
  const binds: unknown[] = [SEED_OWNER_ID];

  // A cursor is only honored when it was minted for the *current* sort.
  const cursor = decodeCursor(opts.cursor);
  const usableCursor = cursor && cursor.s === sort ? cursor : null;

  if (sort === 'featured') {
    where.push('p.featured = 1');
  }
  if (opts.hueBucket != null) {
    where.push(
      'EXISTS (SELECT 1 FROM palette_colors pc WHERE pc.palette_id = p.id AND pc.hue_bucket = ?)',
    );
    binds.push(opts.hueBucket);
  }
  if (opts.tag) {
    where.push('p.tags LIKE ?');
    binds.push(`%${JSON.stringify(opts.tag).slice(1, -1)}%`);
  }

  // For trending, pin the reference clock from the cursor (so subsequent pages
  // rank against the same `now`), else mint a fresh one for the first page.
  const trendingNow =
    sort === 'trending' && usableCursor?.s === 'trending' ? usableCursor.now : Date.now();
  const trendingExpr =
    '(CAST(p.vote_count AS REAL) / (((?) - p.created_at) / 3600000.0 + 2))';

  let orderBy: string;
  switch (sort) {
    case 'new':
      orderBy = 'p.created_at DESC, p.id DESC';
      if (usableCursor?.s === 'new') {
        where.push('(p.created_at < ? OR (p.created_at = ? AND p.id < ?))');
        binds.push(usableCursor.ca, usableCursor.ca, usableCursor.id);
      }
      break;
    case 'featured':
      orderBy = 'p.featured_at DESC, p.id DESC';
      if (usableCursor?.s === 'featured') {
        where.push('(p.featured_at < ? OR (p.featured_at = ? AND p.id < ?))');
        binds.push(usableCursor.fa, usableCursor.fa, usableCursor.id);
      }
      break;
    case 'trending':
      // The decayed score is the lead key; created_at + id break ties stably.
      orderBy = `${trendingExpr} DESC, p.created_at DESC, p.id DESC`;
      binds.push(trendingNow); // for the ORDER BY expression
      if (usableCursor?.s === 'trending') {
        // Keyset on the computed score: re-evaluate the expression in WHERE.
        where.push(
          `(${trendingExpr} < ? OR (${trendingExpr} = ? AND (p.created_at < ? OR (p.created_at = ? AND p.id < ?))))`,
        );
        binds.push(
          trendingNow, // expr in first comparison
          usableCursor.score,
          trendingNow, // expr in second comparison
          usableCursor.score,
          usableCursor.ca,
          usableCursor.ca,
          usableCursor.id,
        );
      }
      break;
    case 'top':
    default:
      orderBy = 'p.vote_count DESC, p.created_at DESC, p.id DESC';
      if (usableCursor?.s === 'top') {
        where.push(
          '(p.vote_count < ? OR (p.vote_count = ? AND (p.created_at < ? OR (p.created_at = ? AND p.id < ?))))',
        );
        binds.push(
          usableCursor.vc,
          usableCursor.vc,
          usableCursor.ca,
          usableCursor.ca,
          usableCursor.id,
        );
      }
      break;
  }

  // Over-fetch one row to detect whether a further page exists.
  const sql = `${PALETTE_SELECT} WHERE ${where.join(' AND ')} ORDER BY ${orderBy} LIMIT ?`;
  binds.push(limit + 1);
  const { results } = await db
    .prepare(sql)
    .bind(...binds)
    .all<PaletteRow>();

  const rows = results ?? [];
  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;

  let nextCursor: string | null = null;
  if (hasMore && pageRows.length > 0) {
    const last = pageRows[pageRows.length - 1];
    nextCursor = encodeCursor(
      cursorForRow(sort, last, trendingNow),
    );
  }

  const items = await summarize(db, pageRows, opts.viewerId ?? null);
  return { items, nextCursor };
}

/** Build the keyset cursor that points just past `row` for the given sort. */
function cursorForRow(sort: ExploreSort, row: PaletteRow, trendingNow: number): ExploreCursor {
  switch (sort) {
    case 'new':
      return { s: 'new', ca: row.created_at, id: row.id };
    case 'featured':
      return { s: 'featured', fa: row.featured_at ?? 0, id: row.id };
    case 'trending':
      return {
        s: 'trending',
        score: trendingScore(row.vote_count, row.created_at, trendingNow),
        ca: row.created_at,
        id: row.id,
        now: trendingNow,
      };
    case 'top':
    default:
      return { s: 'top', vc: row.vote_count, ca: row.created_at, id: row.id };
  }
}

/**
 * Build card summaries for a set of palette rows: attaches the swatch hexes and,
 * when `viewerId` is set, the per-palette `votedByMe` flag (one extra query for
 * the viewer's votes among these palettes - avoids an N+1).
 */
async function summarize(
  db: D1Database,
  rows: PaletteRow[],
  viewerId: string | null,
): Promise<PaletteSummary[]> {
  if (rows.length === 0) return [];

  // One query per chunk of ids for all their swatch hexes (collapses the old
  // N+1 of one readPaletteColors round-trip per row). Only '?' placeholders are
  // interpolated into the SQL; every id is parameter-bound. Chunk to <=90
  // ids/query: D1 caps bound parameters at 100 per query, and the id sets here
  // are effectively unbounded (listLikedPalettesByUser has no LIMIT, and the
  // per-user palette cap isn't atomic), so a single IN(...) over every id could
  // exceed the cap and throw - the old per-row N+1 used one param per query and
  // had no such ceiling. Rows arrive ordered by position within each palette, so
  // grouping preserves swatch order.
  const colorsByPalette = new Map<string, Hex[]>();
  const ids = rows.map((r) => r.id);
  const ID_CHUNK = 90;
  for (let start = 0; start < ids.length; start += ID_CHUNK) {
    const chunk = ids.slice(start, start + ID_CHUNK);
    const placeholders = chunk.map(() => '?').join(',');
    const { results: colorRows } = await db
      .prepare(
        `SELECT palette_id, position, hex FROM palette_colors
         WHERE palette_id IN (${placeholders}) ORDER BY palette_id, position ASC`,
      )
      .bind(...chunk)
      .all<{ palette_id: string; position: number; hex: Hex }>();
    for (const c of colorRows ?? []) {
      const list = colorsByPalette.get(c.palette_id);
      if (list) list.push(c.hex);
      else colorsByPalette.set(c.palette_id, [c.hex]);
    }
  }

  const votedSet = new Set<string>();
  if (viewerId) {
    const { results } = await db
      .prepare('SELECT palette_id FROM palette_votes WHERE user_id = ?')
      .bind(viewerId)
      .all<{ palette_id: string }>();
    for (const r of results ?? []) votedSet.add(r.palette_id);
  }

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    visibility: toVisibility(row.visibility),
    voteCount: row.vote_count,
    votedByMe: votedSet.has(row.id),
    featured: row.featured !== 0,
    createdAt: row.created_at,
    colors: colorsByPalette.get(row.id) ?? [],
  }));
}

/**
 * Palettes this user has liked (upvoted), most-recently-liked first. Joins
 * `palette_votes` to the palette and keeps only public, non-flagged ones (a
 * palette could be hidden/flagged after it was liked). Passing `userId` as the
 * viewer means every returned summary has `votedByMe = true`, so the heart
 * renders filled and the user can un-like from their "Liked" tab.
 */
export async function listLikedPalettesByUser(
  db: D1Database,
  userId: string,
): Promise<PaletteSummary[]> {
  const { results } = await db
    .prepare(
      `${PALETTE_SELECT}
       JOIN palette_votes pv ON pv.palette_id = p.id
       WHERE pv.user_id = ? AND p.visibility = 'public' AND p.flagged = 0
       ORDER BY pv.created_at DESC, p.id DESC`,
    )
    .bind(userId)
    .all<PaletteRow>();
  return summarize(db, results ?? [], userId);
}

/**
 * Cast one upvote. The `palette_votes` PK makes a double-vote a no-op, so the
 * `vote_count` bump is conditioned on the insert actually creating a row
 * (`changes()` from the just-run INSERT) - both statements run in one
 * `db.batch` for atomicity. Returns the resulting `{ voteCount, votedByMe }`.
 */
export async function votePalette(
  db: D1Database,
  userId: string,
  paletteId: string,
): Promise<{ voteCount: number; votedByMe: boolean }> {
  await db.batch([
    db
      .prepare(
        `INSERT INTO palette_votes (palette_id, user_id, created_at) VALUES (?, ?, ?)
         ON CONFLICT (palette_id, user_id) DO NOTHING`,
      )
      .bind(paletteId, userId, Date.now()),
    // Only bump when this user has no prior vote counted - derive the count from
    // the authoritative votes table so a replayed call can't double-count.
    db
      .prepare(
        `UPDATE palettes SET vote_count =
           (SELECT COUNT(*) FROM palette_votes WHERE palette_id = ?) WHERE id = ?`,
      )
      .bind(paletteId, paletteId),
  ]);
  return readVoteState(db, userId, paletteId);
}

/** Remove this user's upvote (no-op if absent) and resync `vote_count`. */
export async function unvotePalette(
  db: D1Database,
  userId: string,
  paletteId: string,
): Promise<{ voteCount: number; votedByMe: boolean }> {
  await db.batch([
    db
      .prepare('DELETE FROM palette_votes WHERE palette_id = ? AND user_id = ?')
      .bind(paletteId, userId),
    db
      .prepare(
        `UPDATE palettes SET vote_count =
           (SELECT COUNT(*) FROM palette_votes WHERE palette_id = ?) WHERE id = ?`,
      )
      .bind(paletteId, paletteId),
  ]);
  return readVoteState(db, userId, paletteId);
}

async function readVoteState(
  db: D1Database,
  userId: string,
  paletteId: string,
): Promise<{ voteCount: number; votedByMe: boolean }> {
  const countRow = await db
    .prepare('SELECT vote_count AS n FROM palettes WHERE id = ?')
    .bind(paletteId)
    .first<{ n: number }>();
  const mine = await db
    .prepare('SELECT 1 AS x FROM palette_votes WHERE palette_id = ? AND user_id = ?')
    .bind(paletteId, userId)
    .first<{ x: number }>();
  return { voteCount: countRow?.n ?? 0, votedByMe: mine != null };
}

// --- Legacy preset → palette backfill ----------------------------------------

/**
 * One-time, non-destructive migration: copy every legacy `presets` row into a
 * 1-color **private** palette (so no saved work leaks public), skipping presets
 * already backfilled. Callable from a script - it performs NO deletes; the
 * `presets` table is left intact as read-only-legacy. Returns the number of
 * palettes created.
 *
 * Slug = kebab(name) + a 4-char base36 suffix derived from the preset id, so a
 * re-run mints the same slug and the `slug UNIQUE` constraint makes it idempotent
 * (a second run inserts nothing). Each color's `hue_bucket` is computed via
 * `hueBucket`.
 */
export async function backfillPresetsToPalettes(db: D1Database): Promise<number> {
  const { results } = await db
    .prepare(
      `SELECT id, user_id, name, hex, view, copy_format
       FROM presets ORDER BY created_at ASC`,
    )
    .all<{
      id: string;
      user_id: string;
      name: string;
      hex: string;
      view: string;
      copy_format: string | null;
    }>();

  let created = 0;
  for (const p of results ?? []) {
    const slug = `${kebab(p.name)}-${slugSuffix(p.id)}`;
    const exists = await db
      .prepare('SELECT 1 AS x FROM palettes WHERE slug = ?')
      .bind(slug)
      .first<{ x: number }>();
    if (exists) continue;

    const now = Date.now();
    const paletteId = crypto.randomUUID();
    const hex = p.hex as Hex;
    await db.batch([
      db
        .prepare(
          `INSERT INTO palettes
             (id, user_id, name, slug, visibility, description, tags, flagged,
              view_count, vote_count, featured, featured_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'private', NULL, NULL, 0, 0, 0, 0, NULL, ?, ?)`,
        )
        .bind(paletteId, p.user_id, p.name, slug, now, now),
      db
        .prepare(
          `INSERT INTO palette_colors
             (palette_id, position, hex, view, copy_format, role, hue_bucket)
           VALUES (?, 0, ?, ?, ?, 'bg', ?)`,
        )
        .bind(paletteId, hex, p.view === 'ramp' ? 'ramp' : 'scale', p.copy_format, hueBucket(hex)),
    ]);
    created += 1;
  }
  return created;
}

/** Lowercase, hyphenate, strip non-alphanumerics - the slug stem. */
function kebab(name: string): string {
  const stem = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return stem || 'palette';
}

/** Deterministic 4-char base36 suffix from an id (stable across re-runs). */
function slugSuffix(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h.toString(36).padStart(4, '0').slice(-4);
}
