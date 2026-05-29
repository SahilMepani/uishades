import { describe, it, expect } from 'vitest';
import {
  consumeMagicToken,
  countPresets,
  deletePreset,
  findOrCreateUserByEmail,
  peekMagicToken,
  resolveOAuthUser,
} from '../src/lib/auth/db';

interface UserRow {
  id: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
  created_at: number;
}

/**
 * Minimal in-memory D1 fake that dispatches on the (stable) SQL strings used by
 * db.ts. Enough to exercise control flow without a real SQLite.
 */
class FakeD1 {
  users = new Map<string, UserRow>(); // by id
  oauth = new Map<string, string>(); // `${provider}:${providerUserId}` -> user_id
  tokens = new Map<string, { email: string; expires_at: number }>();
  presets: { id: string; user_id: string }[] = [];
  failNextUserInsert = false;

  prepare(sql: string) {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const db = this;
    let args: unknown[] = [];
    const stmt = {
      bind(...a: unknown[]) {
        args = a;
        return stmt;
      },
      async first<T>(): Promise<T | null> {
        // consumeMagicToken: DELETE ... RETURNING — delete and return the row.
        if (sql.startsWith('DELETE FROM magic_link_tokens')) {
          const key = args[0] as string;
          const t = db.tokens.get(key);
          db.tokens.delete(key);
          return (t ? { email: t.email, expires_at: t.expires_at } : null) as T | null;
        }
        if (sql.includes('FROM users WHERE email')) {
          for (const u of db.users.values()) if (u.email === args[0]) return u as T;
          return null;
        }
        if (sql.includes('FROM users WHERE id')) {
          return (db.users.get(args[0] as string) ?? null) as T | null;
        }
        if (sql.includes('FROM oauth_accounts WHERE provider')) {
          const uid = db.oauth.get(`${args[0]}:${args[1]}`);
          return (uid ? { user_id: uid } : null) as T | null;
        }
        // peekMagicToken: SELECT — must NOT delete.
        if (sql.includes('FROM magic_link_tokens WHERE token_hash')) {
          const t = db.tokens.get(args[0] as string);
          return (t ? { email: t.email, expires_at: t.expires_at } : null) as T | null;
        }
        if (sql.includes('COUNT(*) AS n FROM presets')) {
          const n = db.presets.filter((p) => p.user_id === args[0]).length;
          return { n } as T;
        }
        return null;
      },
      async run() {
        if (sql.startsWith('INSERT INTO users')) {
          if (db.failNextUserInsert) {
            db.failNextUserInsert = false;
            throw new Error('UNIQUE constraint failed: users.email');
          }
          const [id, email, name, avatar_url, created_at] = args as [
            string,
            string,
            string | null,
            string | null,
            number,
          ];
          db.users.set(id, { id, email, name, avatar_url, created_at });
          return { meta: { changes: 1 } };
        }
        if (sql.startsWith('INSERT INTO oauth_accounts')) {
          const [provider, providerUserId, userId] = args as [string, string, string];
          const key = `${provider}:${providerUserId}`;
          if (!db.oauth.has(key)) db.oauth.set(key, userId); // ON CONFLICT DO NOTHING
          return { meta: { changes: db.oauth.get(key) === userId ? 1 : 0 } };
        }
        if (sql.startsWith('DELETE FROM magic_link_tokens')) {
          const had = db.tokens.delete(args[0] as string);
          return { meta: { changes: had ? 1 : 0 } };
        }
        if (sql.startsWith('DELETE FROM presets')) {
          const [id, userId] = args as [string, string];
          const before = db.presets.length;
          db.presets = db.presets.filter((p) => !(p.id === id && p.user_id === userId));
          return { meta: { changes: before - db.presets.length } };
        }
        return { meta: { changes: 0 } };
      },
      async all<T>() {
        return { results: [] as T[] };
      },
    };
    return stmt;
  }
}

const asD1 = (f: FakeD1) => f as unknown as D1Database;

describe('findOrCreateUserByEmail', () => {
  it('returns the existing user without inserting', async () => {
    const db = new FakeD1();
    db.users.set('u1', { id: 'u1', email: 'a@b.co', name: 'A', avatar_url: null, created_at: 1 });
    const user = await findOrCreateUserByEmail(asD1(db), { email: 'a@b.co' });
    expect(user.id).toBe('u1');
    expect(db.users.size).toBe(1); // no new row
  });

  it('creates a new user (lowercasing the email) when absent', async () => {
    const db = new FakeD1();
    const user = await findOrCreateUserByEmail(asD1(db), { email: 'New@Example.com', name: 'N' });
    expect(user.email).toBe('new@example.com');
    expect(user.name).toBe('N');
    expect(user.id).toMatch(/[0-9a-f-]{36}/);
    expect(db.users.size).toBe(1);
  });

  it('re-finds the winner on an insert race', async () => {
    const winner: UserRow = { id: 'w', email: 'race@x.com', name: null, avatar_url: null, created_at: 1 };
    let emailSelects = 0;
    const db = {
      prepare(sql: string) {
        let args: unknown[] = [];
        const stmt = {
          bind(...a: unknown[]) {
            args = a;
            return stmt;
          },
          async first() {
            if (sql.includes('FROM users WHERE email')) {
              emailSelects++;
              return emailSelects === 1 ? null : winner; // not visible, then visible
            }
            return null;
          },
          async run() {
            if (sql.startsWith('INSERT INTO users')) throw new Error('UNIQUE constraint failed');
            return { meta: { changes: 0 } };
          },
          async all() {
            return { results: [] };
          },
        };
        return stmt;
      },
    } as unknown as D1Database;

    const user = await findOrCreateUserByEmail(db, { email: 'race@x.com' });
    expect(user.id).toBe('w');
    expect(emailSelects).toBe(2);
  });

  it('re-throws the original error when the insert fails for a non-race reason', async () => {
    // The insert throws but the user is never found — a genuine failure, not a
    // UNIQUE race. The real error must surface, not a masked generic message.
    const db = {
      prepare(sql: string) {
        const stmt = {
          bind() {
            return stmt;
          },
          async first() {
            return null; // user never appears
          },
          async run() {
            if (sql.startsWith('INSERT INTO users')) throw new Error('D1_ERROR: disk full');
            return { meta: { changes: 0 } };
          },
          async all() {
            return { results: [] };
          },
        };
        return stmt;
      },
    } as unknown as D1Database;

    await expect(findOrCreateUserByEmail(db, { email: 'x@y.co' })).rejects.toThrow('disk full');
  });
});

describe('resolveOAuthUser (provider-id stability + cross-provider linking)', () => {
  it('returns the existing user by provider account id, even after the provider email changed', async () => {
    const db = new FakeD1();
    db.users.set('u1', { id: 'u1', email: 'old@x.com', name: 'A', avatar_url: null, created_at: 1 });
    db.oauth.set('github:123', 'u1');

    const user = await resolveOAuthUser(
      asD1(db),
      { provider: 'github', providerUserId: '123' },
      { email: 'new@x.com' }, // email changed at the provider
    );

    expect(user.id).toBe('u1'); // same account — presets not orphaned
    expect(db.users.size).toBe(1); // did NOT mint a new user for the new email
  });

  it('links a new provider account to an existing same-email user (cross-provider)', async () => {
    const db = new FakeD1();
    db.users.set('u1', { id: 'u1', email: 'a@b.co', name: null, avatar_url: null, created_at: 1 });
    db.oauth.set('google:gsub', 'u1'); // already signed in with Google

    const user = await resolveOAuthUser(
      asD1(db),
      { provider: 'github', providerUserId: '999' }, // first GitHub login
      { email: 'a@b.co' },
    );

    expect(user.id).toBe('u1'); // linked by verified email, not a new account
    expect(db.users.size).toBe(1);
    expect(db.oauth.get('github:999')).toBe('u1'); // new link recorded
  });

  it('creates and links a brand-new user', async () => {
    const db = new FakeD1();
    const user = await resolveOAuthUser(
      asD1(db),
      { provider: 'github', providerUserId: '7' },
      { email: 'New@Z.co', name: 'Z' },
    );
    expect(user.email).toBe('new@z.co');
    expect(db.users.size).toBe(1);
    expect(db.oauth.get('github:7')).toBe(user.id);
  });
});

describe('consumeMagicToken', () => {
  it('returns the email for a valid token and deletes it (single-use)', async () => {
    const db = new FakeD1();
    db.tokens.set('hash1', { email: 'a@b.co', expires_at: Date.now() + 60_000 });
    const email = await consumeMagicToken(asD1(db), 'hash1');
    expect(email).toBe('a@b.co');
    expect(db.tokens.has('hash1')).toBe(false); // consumed
  });

  it('returns null for an expired token but still deletes it', async () => {
    const db = new FakeD1();
    db.tokens.set('old', { email: 'a@b.co', expires_at: Date.now() - 1 });
    const email = await consumeMagicToken(asD1(db), 'old');
    expect(email).toBeNull();
    expect(db.tokens.has('old')).toBe(false);
  });

  it('returns null for an unknown token', async () => {
    const db = new FakeD1();
    expect(await consumeMagicToken(asD1(db), 'missing')).toBeNull();
  });
});

describe('peekMagicToken (confirm step — non-consuming)', () => {
  it('returns the email WITHOUT deleting the token', async () => {
    const db = new FakeD1();
    db.tokens.set('h', { email: 'a@b.co', expires_at: Date.now() + 60_000 });
    expect(await peekMagicToken(asD1(db), 'h')).toBe('a@b.co');
    expect(db.tokens.has('h')).toBe(true); // still consumable by the POST
  });

  it('returns null for expired or unknown tokens', async () => {
    const db = new FakeD1();
    db.tokens.set('old', { email: 'a@b.co', expires_at: Date.now() - 1 });
    expect(await peekMagicToken(asD1(db), 'old')).toBeNull();
    expect(await peekMagicToken(asD1(db), 'missing')).toBeNull();
  });
});

describe('countPresets', () => {
  it('counts only the caller-owned presets', async () => {
    const db = new FakeD1();
    db.presets.push(
      { id: 'p1', user_id: 'u1' },
      { id: 'p2', user_id: 'u1' },
      { id: 'p3', user_id: 'other' },
    );
    expect(await countPresets(asD1(db), 'u1')).toBe(2);
    expect(await countPresets(asD1(db), 'nobody')).toBe(0);
  });
});

describe('deletePreset (user scoping)', () => {
  it('deletes only the caller-owned preset', async () => {
    const db = new FakeD1();
    db.presets.push({ id: 'p1', user_id: 'owner' });

    // Another user cannot delete it.
    expect(await deletePreset(asD1(db), 'attacker', 'p1')).toBe(false);
    expect(db.presets.length).toBe(1);

    // The owner can.
    expect(await deletePreset(asD1(db), 'owner', 'p1')).toBe(true);
    expect(db.presets.length).toBe(0);
  });
});
