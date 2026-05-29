/**
 * D1 data access for auth + presets. Every function takes the `DB` binding as
 * its first argument (dependency injection) so the logic is unit-testable with
 * a mocked D1 — this module never imports `cloudflare:workers`.
 *
 * `findOrCreateUserByEmail` is the account-linking rule: a *verified* email is
 * the single identity key across Google, GitHub, and magic link. Callers MUST
 * have verified the email first (see the OAuth callbacks' verified-email gate).
 */
import type { CopyFormat, ExportFormat, Hex } from '../color/types';
import { normalizeEmail } from './normalize';
import type { OAuthProvider, Preset, User } from './types';

interface UserRow {
  id: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
  created_at: number;
}

function toUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    avatarUrl: row.avatar_url,
    createdAt: row.created_at,
  };
}

export async function findUserByEmail(db: D1Database, email: string): Promise<User | null> {
  const row = await db
    .prepare('SELECT id, email, name, avatar_url, created_at FROM users WHERE email = ?')
    .bind(normalizeEmail(email))
    .first<UserRow>();
  return row ? toUser(row) : null;
}

export async function getUserById(db: D1Database, id: string): Promise<User | null> {
  const row = await db
    .prepare('SELECT id, email, name, avatar_url, created_at FROM users WHERE id = ?')
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
  };
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
    // Otherwise it was a genuine failure (transient write error, etc.) — surface
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
 * linking key — which is what lets a second provider attach to an existing
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
 * Look up a token WITHOUT consuming it — for the GET confirm step, which must be
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
 * same token can't both observe it — enforcing single-use even under a race.
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

export async function recordMagicRequest(db: D1Database, key: string, at: number): Promise<void> {
  await db
    .prepare('INSERT INTO magic_link_requests (key, created_at) VALUES (?, ?)')
    .bind(key, at)
    .run();
}

export async function pruneMagicRequests(db: D1Database, beforeMs: number): Promise<void> {
  await db.prepare('DELETE FROM magic_link_requests WHERE created_at < ?').bind(beforeMs).run();
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

/** Scoped delete — a user can only delete their own presets. */
export async function deletePreset(db: D1Database, userId: string, id: string): Promise<boolean> {
  const res = await db
    .prepare('DELETE FROM presets WHERE id = ? AND user_id = ?')
    .bind(id, userId)
    .run();
  return (res.meta?.changes ?? 0) > 0;
}
