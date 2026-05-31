import { describe, it, expect } from 'vitest';
import {
  createPalette,
  getPaletteBySlug,
  getPaletteWithColors,
  isPro,
  listPalettesByUser,
  listLikedPalettesByUser,
  votePalette,
  unvotePalette,
  listPublicPalettes,
  SEED_OWNER_ID,
} from '../src/lib/auth/db';
import type { User } from '../src/lib/auth/types';

/**
 * In-memory D1 fake mirroring tests/auth-db.spec.ts: dispatch on the stable SQL
 * substrings db.ts uses. Models the palettes / palette_colors / palette_votes
 * tables well enough to exercise visibility and vote idempotency. Supports
 * `prepare().bind().run()/.first()/.all()` and the `db.batch([...])` used by
 * createPalette / votePalette.
 */
interface PaletteRecord {
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
interface ColorRecord {
  palette_id: string;
  position: number;
  hex: string;
  view: string;
  copy_format: string | null;
  role: string | null;
  hue_bucket: number | null;
}
interface VoteRecord {
  palette_id: string;
  user_id: string;
  created_at: number;
}

class FakeD1 {
  palettes: PaletteRecord[] = [];
  colors: ColorRecord[] = [];
  votes: VoteRecord[] = [];

  private exec(sql: string, args: unknown[]): { meta: { changes: number } } {
    if (sql.startsWith('INSERT INTO palettes')) {
      const [
        id,
        user_id,
        name,
        slug,
        visibility,
        description,
        tags,
        created_at,
        updated_at,
      ] = args as [string, string, string, string, string, string | null, string | null, number, number];
      this.palettes.push({
        id,
        user_id,
        name,
        slug,
        visibility,
        description,
        tags,
        flagged: 0,
        view_count: 0,
        vote_count: 0,
        featured: 0,
        featured_at: null,
        created_at,
        updated_at,
      });
      return { meta: { changes: 1 } };
    }
    if (sql.startsWith('INSERT INTO palette_colors')) {
      const [palette_id, position, hex, view, copy_format, role, hue_bucket] = args as [
        string,
        number,
        string,
        string,
        string | null,
        string | null,
        number | null,
      ];
      this.colors.push({ palette_id, position, hex, view, copy_format, role, hue_bucket });
      return { meta: { changes: 1 } };
    }
    if (sql.startsWith('INSERT INTO palette_votes')) {
      const [palette_id, user_id, created_at] = args as [string, string, number];
      const dup = this.votes.some((v) => v.palette_id === palette_id && v.user_id === user_id);
      if (dup) return { meta: { changes: 0 } }; // ON CONFLICT DO NOTHING
      this.votes.push({ palette_id, user_id, created_at });
      return { meta: { changes: 1 } };
    }
    if (sql.startsWith('DELETE FROM palette_votes')) {
      const [palette_id, user_id] = args as [string, string];
      const before = this.votes.length;
      this.votes = this.votes.filter((v) => !(v.palette_id === palette_id && v.user_id === user_id));
      return { meta: { changes: before - this.votes.length } };
    }
    if (sql.startsWith('UPDATE palettes SET vote_count')) {
      const [countPaletteId, id] = args as [string, string];
      const n = this.votes.filter((v) => v.palette_id === countPaletteId).length;
      const p = this.palettes.find((x) => x.id === id);
      if (p) p.vote_count = n;
      return { meta: { changes: p ? 1 : 0 } };
    }
    return { meta: { changes: 0 } };
  }

  prepare(sql: string) {
    const db = this;
    let args: unknown[] = [];
    const stmt = {
      bind(...a: unknown[]) {
        args = a;
        return stmt;
      },
      async first<T>(): Promise<T | null> {
        if (sql.includes('FROM palettes p') && sql.includes('p.slug = ?')) {
          const p = db.palettes.find((x) => x.slug === args[0]);
          return p ? (p as T) : null;
        }
        if (sql.includes('FROM palettes p') && sql.includes('p.id = ?')) {
          const p = db.palettes.find((x) => x.id === args[0]);
          return p ? (p as T) : null;
        }
        if (sql.includes('SELECT vote_count AS n FROM palettes')) {
          const p = db.palettes.find((x) => x.id === args[0]);
          return (p ? { n: p.vote_count } : null) as T | null;
        }
        if (sql.includes('FROM palette_votes WHERE palette_id = ? AND user_id = ?')) {
          const has = db.votes.some((v) => v.palette_id === args[0] && v.user_id === args[1]);
          return (has ? { x: 1 } : null) as T | null;
        }
        return null;
      },
      async run() {
        return db.exec(sql, args);
      },
      async all<T>() {
        if (sql.includes('FROM palette_colors WHERE palette_id = ?')) {
          const rows = db.colors
            .filter((c) => c.palette_id === args[0])
            .sort((a, b) => a.position - b.position);
          return { results: rows as unknown as T[] };
        }
        // Explore listing: public, non-flagged, SEED-OWNER-ONLY, "new" sort
        // (created_at DESC, id DESC) with optional keyset cursor. Distinguished
        // from the per-user listings below by its trailing `LIMIT ?` over-fetch.
        // Binds always lead with the seed-owner user_id; the last bind is LIMIT.
        if (
          sql.includes('FROM palettes p') &&
          sql.includes("p.visibility = 'public'") &&
          sql.includes('LIMIT ?')
        ) {
          const ownerId = args[0] as string;
          const limit = args[args.length - 1] as number;
          let rows = db.palettes
            .filter(
              (p) => p.visibility === 'public' && p.flagged === 0 && p.user_id === ownerId,
            )
            .sort((a, b) => b.created_at - a.created_at || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
          // Keyset predicate present → binds are [ownerId, ca, ca, id, limit].
          if (sql.includes('p.created_at < ?')) {
            const ca = args[1] as number;
            const id = args[3] as string;
            rows = rows.filter((p) => p.created_at < ca || (p.created_at === ca && p.id < id));
          }
          const page = rows.slice(0, limit).map((p) => p);
          return { results: page as unknown as T[] };
        }
        // Liked listing: palettes this user upvoted, public + non-flagged,
        // most-recently-liked first (joins palette_votes on pv.user_id = ?).
        if (sql.includes('JOIN palette_votes pv') && sql.includes('pv.user_id = ?')) {
          const uid = args[0] as string;
          const liked = db.votes
            .filter((v) => v.user_id === uid)
            .sort((a, b) => b.created_at - a.created_at)
            .map((v) => db.palettes.find((p) => p.id === v.palette_id))
            .filter(
              (p): p is PaletteRecord =>
                !!p && p.visibility === 'public' && p.flagged === 0,
            )
            .map((p) => p);
          return { results: liked as unknown as T[] };
        }
        if (sql.includes('FROM palettes p') && sql.includes('p.user_id = ?')) {
          const rows = db.palettes
            .filter((p) => p.user_id === args[0])
            .sort((a, b) => b.created_at - a.created_at)
            .map((p) => p);
          return { results: rows as unknown as T[] };
        }
        if (sql.includes('FROM palette_votes WHERE user_id = ?')) {
          const rows = db.votes
            .filter((v) => v.user_id === args[0])
            .map((v) => ({ palette_id: v.palette_id }));
          return { results: rows as unknown as T[] };
        }
        return { results: [] as T[] };
      },
    };
    return stmt;
  }

  async batch(stmts: { run: () => Promise<unknown> }[]) {
    const out = [];
    for (const s of stmts) out.push(await s.run());
    return out;
  }
}

const asD1 = (f: FakeD1) => f as unknown as D1Database;

describe('createPalette + getPaletteWithColors', () => {
  it('stores colors with auto-assigned roles and hue buckets', async () => {
    const db = new FakeD1();
    const p = await createPalette(asD1(db), 'owner', {
      name: 'Sunset',
      slug: 'sunset-ab12',
      colors: [{ hex: '#ff0000' }, { hex: '#0000ff' }],
    });
    expect(p.colors).toHaveLength(2);
    expect(p.colors[0].role).toBe('bg');
    expect(p.colors[1].role).toBe('surface');
    expect(p.colors[0].hueBucket).not.toBeNull();

    const read = await getPaletteWithColors(asD1(db), p.id);
    expect(read?.colors.map((c) => c.hex)).toEqual(['#ff0000', '#0000ff']);
  });
});

describe('getPaletteBySlug visibility', () => {
  it('returns a public palette to anyone', async () => {
    const db = new FakeD1();
    await createPalette(asD1(db), 'owner', {
      name: 'Pub',
      slug: 'pub-1',
      visibility: 'public',
      colors: [{ hex: '#123456' }],
    });
    const anon = await getPaletteBySlug(asD1(db), 'pub-1');
    expect(anon?.slug).toBe('pub-1');
  });

  it('hides a private palette from non-owners but shows it to the owner', async () => {
    const db = new FakeD1();
    await createPalette(asD1(db), 'owner', {
      name: 'Secret',
      slug: 'secret-1',
      visibility: 'private',
      colors: [{ hex: '#abcdef' }],
    });
    expect(await getPaletteBySlug(asD1(db), 'secret-1')).toBeNull(); // anon
    expect(await getPaletteBySlug(asD1(db), 'secret-1', 'attacker')).toBeNull();
    const owner = await getPaletteBySlug(asD1(db), 'secret-1', 'owner');
    expect(owner?.visibility).toBe('private');
  });

  it('hides a flagged public palette from the public', async () => {
    const db = new FakeD1();
    await createPalette(asD1(db), 'owner', {
      name: 'Bad',
      slug: 'bad-1',
      visibility: 'public',
      colors: [{ hex: '#111111' }],
    });
    db.palettes[0].flagged = 1;
    expect(await getPaletteBySlug(asD1(db), 'bad-1')).toBeNull();
    expect((await getPaletteBySlug(asD1(db), 'bad-1', 'owner'))?.slug).toBe('bad-1'); // owner sees
  });
});

describe('listPalettesByUser', () => {
  it('returns the user palettes as summaries with swatch hexes', async () => {
    const db = new FakeD1();
    await createPalette(asD1(db), 'owner', {
      name: 'A',
      slug: 'a-1',
      colors: [{ hex: '#aa0000' }, { hex: '#00aa00' }],
    });
    const list = await listPalettesByUser(asD1(db), 'owner');
    expect(list).toHaveLength(1);
    expect(list[0].colors).toEqual(['#aa0000', '#00aa00']);
  });
});

describe('listLikedPalettesByUser', () => {
  it('returns the viewer\'s liked public palettes, most-recently-liked first', async () => {
    const db = new FakeD1();
    const a = await createPalette(asD1(db), SEED_OWNER_ID, {
      name: 'A',
      slug: 'a',
      visibility: 'public',
      colors: [{ hex: '#111111' }],
    });
    const b = await createPalette(asD1(db), SEED_OWNER_ID, {
      name: 'B',
      slug: 'b',
      visibility: 'public',
      colors: [{ hex: '#222222' }],
    });
    await votePalette(asD1(db), 'viewer', a.id);
    await votePalette(asD1(db), 'viewer', b.id);
    // Pin both like timestamps so the most-recent-first order is deterministic
    // (b liked after a).
    db.votes.find((v) => v.palette_id === a.id)!.created_at = 1000;
    db.votes.find((v) => v.palette_id === b.id)!.created_at = 2000;

    const liked = await listLikedPalettesByUser(asD1(db), 'viewer');
    expect(liked.map((x) => x.slug)).toEqual(['b', 'a']);
    // The viewer owns these likes, so every summary's heart is filled.
    expect(liked.every((x) => x.votedByMe)).toBe(true);
  });

  it('excludes a palette that was flagged after the viewer liked it', async () => {
    const db = new FakeD1();
    const a = await createPalette(asD1(db), SEED_OWNER_ID, {
      name: 'A',
      slug: 'a',
      visibility: 'public',
      colors: [{ hex: '#111111' }],
    });
    await votePalette(asD1(db), 'viewer', a.id);
    db.palettes.find((p) => p.id === a.id)!.flagged = 1;

    expect(await listLikedPalettesByUser(asD1(db), 'viewer')).toEqual([]);
  });
});

describe('votePalette / unvotePalette idempotency', () => {
  it('counts one vote per user and is a no-op on a double-vote', async () => {
    const db = new FakeD1();
    const p = await createPalette(asD1(db), 'owner', {
      name: 'V',
      slug: 'v-1',
      colors: [{ hex: '#222222' }],
    });
    const first = await votePalette(asD1(db), 'voter', p.id);
    expect(first).toEqual({ voteCount: 1, votedByMe: true });

    const second = await votePalette(asD1(db), 'voter', p.id); // double-vote
    expect(second).toEqual({ voteCount: 1, votedByMe: true });

    const other = await votePalette(asD1(db), 'voter2', p.id);
    expect(other.voteCount).toBe(2);

    const removed = await unvotePalette(asD1(db), 'voter', p.id);
    expect(removed).toEqual({ voteCount: 1, votedByMe: false });

    const removedAgain = await unvotePalette(asD1(db), 'voter', p.id); // already gone
    expect(removedAgain.voteCount).toBe(1);
  });
});

describe('listPublicPalettes cursor pagination', () => {
  it('paginates "new" sort across two pages with no overlap and stable order', async () => {
    const db = new FakeD1();
    // Five public palettes with strictly increasing created_at so the DESC order
    // is fully determined (newest first: e, d, c, b, a).
    for (let i = 0; i < 5; i++) {
      await createPalette(asD1(db), SEED_OWNER_ID, {
        name: `P${i}`,
        slug: `p-${i}`,
        visibility: 'public',
        colors: [{ hex: '#112233' }],
      });
    }
    db.palettes.forEach((p, i) => {
      p.created_at = 1000 + i; // p-0=1000 ... p-4=1004
    });

    const page1 = await listPublicPalettes(asD1(db), { sort: 'new', limit: 2 });
    expect(page1.items.map((x) => x.slug)).toEqual(['p-4', 'p-3']);
    expect(page1.nextCursor).not.toBeNull();

    const page2 = await listPublicPalettes(asD1(db), {
      sort: 'new',
      limit: 2,
      cursor: page1.nextCursor,
    });
    expect(page2.items.map((x) => x.slug)).toEqual(['p-2', 'p-1']);
    expect(page2.nextCursor).not.toBeNull();

    const page3 = await listPublicPalettes(asD1(db), {
      sort: 'new',
      limit: 2,
      cursor: page2.nextCursor,
    });
    expect(page3.items.map((x) => x.slug)).toEqual(['p-0']);
    // Last page: no further rows → no cursor.
    expect(page3.nextCursor).toBeNull();

    // No overlap across pages; full set covered exactly once.
    const all = [...page1.items, ...page2.items, ...page3.items].map((x) => x.slug);
    expect(new Set(all).size).toBe(5);
    expect(all).toEqual(['p-4', 'p-3', 'p-2', 'p-1', 'p-0']);
  });

  it('excludes flagged and private palettes', async () => {
    const db = new FakeD1();
    await createPalette(asD1(db), SEED_OWNER_ID, {
      name: 'Pub',
      slug: 'keep-1',
      visibility: 'public',
      colors: [{ hex: '#112233' }],
    });
    await createPalette(asD1(db), SEED_OWNER_ID, {
      name: 'Priv',
      slug: 'priv-1',
      visibility: 'private',
      colors: [{ hex: '#112233' }],
    });
    await createPalette(asD1(db), SEED_OWNER_ID, {
      name: 'Flag',
      slug: 'flag-1',
      visibility: 'public',
      colors: [{ hex: '#112233' }],
    });
    db.palettes.find((p) => p.slug === 'flag-1')!.flagged = 1;

    const res = await listPublicPalettes(asD1(db), { sort: 'new', limit: 10 });
    expect(res.items.map((x) => x.slug)).toEqual(['keep-1']);
    expect(res.nextCursor).toBeNull();
  });
});

describe('isPro boundary', () => {
  const base: Pick<User, 'plan' | 'planUntil'> = { plan: 'free', planUntil: null };
  it('is false for free users', () => {
    expect(isPro(base)).toBe(false);
  });
  it('is false for a pro plan with no / past plan_until', () => {
    expect(isPro({ plan: 'pro', planUntil: null })).toBe(false);
    expect(isPro({ plan: 'pro', planUntil: Date.now() - 1 })).toBe(false);
  });
  it('is true only for a pro plan still within its window', () => {
    expect(isPro({ plan: 'pro', planUntil: Date.now() + 60_000 })).toBe(true);
  });
});
