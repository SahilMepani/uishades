/**
 * Generates SQL to seed a few founder-curated Featured palettes, emitted to
 * stdout. Apply with:
 *   SEED_OWNER_EMAIL=you@example.com node scripts/seed-featured.mjs > /tmp/seed.sql
 *   npx wrangler d1 execute uishades --remote --file=/tmp/seed.sql
 *
 * One-time seed: it INSERT-OR-IGNOREs a single owner account (fixed id, linked
 * by SEED_OWNER_EMAIL so signing in with that email later owns these), then
 * inserts the palettes + colors. hue_bucket is computed with culori to match
 * src/lib/color/hue.ts (12 ~30° families, NULL below chroma 0.03) so the
 * /explore colour filter works. Re-running would duplicate the palettes —
 * intended to run once against an empty gallery.
 */
import { oklch } from 'culori';

const OWNER_EMAIL = process.env.SEED_OWNER_EMAIL;
if (!OWNER_EMAIL) {
  console.error('Set SEED_OWNER_EMAIL'); // eslint-disable-line no-console
  process.exit(1);
}

// Fixed so re-runs reference a stable owner row.
const OWNER_ID = 'seed00000-0000-4000-8000-000000000001';
const OWNER_HANDLE = 'uishades';
const OWNER_NAME = 'UIshades';
const ACHROMATIC_CHROMA = 0.03;
const now = Date.now();

function hueBucket(hex) {
  const c = oklch(hex);
  if (!c || c.c == null || c.c < ACHROMATIC_CHROMA || c.h == null || Number.isNaN(c.h)) return null;
  return (((Math.round(c.h / 30) % 12) + 12) % 12);
}
const kebab = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const rand4 = () => Math.random().toString(36).slice(2, 6);
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

// roles by position: bg, surface, accent, text, extra
const PALETTES = [
  { name: 'Oxblood Sunset', tags: ['warm'], colors: ['#fdf6f0', '#f4dccb', '#b8431e', '#2b1a14', '#e8956b'] },
  { name: 'Deep Ocean', tags: ['cool'], colors: ['#f0f6fa', '#d7e8f2', '#1e6fb8', '#102a3a', '#5bb0d8'] },
  { name: 'Forest Floor', tags: ['muted'], colors: ['#f4f7f0', '#dde8d2', '#4a7c2e', '#1f2a16', '#8fae6a'] },
  { name: 'Slate Mono', tags: ['mono'], colors: ['#fafafa', '#ececec', '#444444', '#111111', '#8a8a8a'] },
  { name: 'Candy Pop', tags: ['vibrant'], colors: ['#fff0f6', '#ffd6e7', '#e0267d', '#3a0a22', '#ffb03c'] },
];
const ROLES = ['bg', 'surface', 'accent', 'text', 'extra'];

// No explicit BEGIN/COMMIT: Cloudflare D1 (remote) rejects SQL transaction
// statements (it manages atomicity itself). wrangler applies the file's
// statements together.
const lines = [];
lines.push(
  `INSERT OR IGNORE INTO users (id, email, name, avatar_url, created_at, plan, plan_until, handle, display_name) ` +
    `VALUES (${q(OWNER_ID)}, ${q(OWNER_EMAIL.toLowerCase())}, ${q(OWNER_NAME)}, NULL, ${now}, 'free', NULL, ${q(OWNER_HANDLE)}, ${q(OWNER_NAME)});`,
);

let n = 0;
for (const p of PALETTES) {
  const id = `seedp${String(++n).padStart(3, '0')}-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`;
  const slug = `${kebab(p.name)}-${rand4()}`;
  lines.push(
    `INSERT INTO palettes (id, user_id, name, slug, visibility, description, tags, flagged, view_count, vote_count, featured, featured_at, created_at, updated_at) ` +
      `VALUES (${q(id)}, ${q(OWNER_ID)}, ${q(p.name)}, ${q(slug)}, 'public', NULL, ${q(JSON.stringify(p.tags))}, 0, 0, 0, 1, ${now}, ${now}, ${now});`,
  );
  p.colors.forEach((hex, i) => {
    const hb = hueBucket(hex);
    lines.push(
      `INSERT INTO palette_colors (palette_id, position, hex, view, copy_format, role, hue_bucket) ` +
        `VALUES (${q(id)}, ${i}, ${q(hex)}, 'scale', 'hex', ${q(ROLES[i] ?? 'extra')}, ${hb == null ? 'NULL' : hb});`,
    );
  });
}
process.stdout.write(lines.join('\n') + '\n');
