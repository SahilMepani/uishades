/**
 * Generates SQL for 100 demo palettes owned by the existing `uishades` account,
 * to populate /explore (and exercise the 20-per-page "Load more"). Emitted to
 * stdout. Apply with:
 *   SEED_OWNER_EMAIL=you@example.com node scripts/seed-explore-demo.mjs > /tmp/demo.sql
 *   npx wrangler d1 execute uishades --local  --file=/tmp/demo.sql   # dev
 *   npx wrangler d1 execute uishades --remote --file=/tmp/demo.sql   # prod
 *
 * All rows use a 'demo-' id prefix, so they're trivially removable:
 *   DELETE FROM palette_colors WHERE palette_id LIKE 'demo-%';
 *   DELETE FROM palettes       WHERE id        LIKE 'demo-%';
 *
 * Colours are built with culori (oklch → gamut-clamped hex); hue_bucket matches
 * src/lib/color/hue.ts (12 ~30° families, NULL below chroma 0.03). Public, NOT
 * featured (the Featured tab stays curated). Varied vote_count/created_at so the
 * Top/New sorts and keyset pagination look alive.
 */
import { formatHex, oklch } from 'culori';

const OWNER_EMAIL = process.env.SEED_OWNER_EMAIL;
if (!OWNER_EMAIL) { console.error('Set SEED_OWNER_EMAIL'); process.exit(1); } // eslint-disable-line no-console

const OWNER_ID = 'seed00000-0000-4000-8000-000000000001'; // the `uishades` account
const COUNT = 100;
const ACHROMATIC_CHROMA = 0.03;
const now = Date.now();

const ADJ = ['Soft', 'Bold', 'Quiet', 'Bright', 'Deep', 'Warm', 'Cool', 'Muted', 'Vivid', 'Pale'];
const NOUN = ['Horizon', 'Meadow', 'Harbor', 'Canyon', 'Orchard', 'Lagoon', 'Summit', 'Prairie', 'Cove', 'Thicket'];
const ROLES = ['bg', 'surface', 'accent', 'text', 'extra'];

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const kebab = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const hex = (l, c, h) => formatHex({ mode: 'oklch', l, c, h });
function hueBucket(hx) {
  const c = oklch(hx);
  if (!c || c.c == null || c.c < ACHROMATIC_CHROMA || c.h == null || Number.isNaN(c.h)) return null;
  return (((Math.round(c.h / 30) % 12) + 12) % 12);
}

const lines = [];
lines.push(
  `INSERT OR IGNORE INTO users (id, email, name, avatar_url, created_at, plan, plan_until) ` +
    `VALUES (${q(OWNER_ID)}, ${q(OWNER_EMAIL.toLowerCase())}, 'UIshades', NULL, ${now}, 'free', NULL);`,
);

for (let i = 0; i < COUNT; i++) {
  const h = (i * 137.508) % 360; // golden angle → even hue spread
  const colors = [
    hex(0.97, 0.015, h), // bg
    hex(0.91, 0.045, h), // surface
    hex(0.58, 0.16, h),  // accent
    hex(0.27, 0.04, h),  // text
    hex(0.72, 0.12, h),  // extra
  ];
  const name = `${ADJ[i % ADJ.length]} ${NOUN[Math.floor(i / ADJ.length) % NOUN.length]}`; // 10×10 = 100 unique
  const num = String(i + 1).padStart(3, '0');
  const id = `demo-${num}`;
  const slug = `${kebab(name)}-${num}`;
  const tags = h < 90 || h >= 300 ? '["warm"]' : '["cool"]';
  const votes = (i * 37) % 53;            // 0..52, deterministic spread for Top sort
  const created = now - i * 1000;         // stagger for New sort

  lines.push(
    `INSERT OR IGNORE INTO palettes (id, user_id, name, slug, visibility, description, tags, flagged, view_count, vote_count, featured, featured_at, created_at, updated_at) ` +
      `VALUES (${q(id)}, ${q(OWNER_ID)}, ${q(name)}, ${q(slug)}, 'public', NULL, ${q(tags)}, 0, 0, ${votes}, 0, NULL, ${created}, ${created});`,
  );
  colors.forEach((hx, j) => {
    const hb = hueBucket(hx);
    lines.push(
      `INSERT OR IGNORE INTO palette_colors (palette_id, position, hex, view, copy_format, role, hue_bucket) ` +
        `VALUES (${q(id)}, ${j}, ${q(hx)}, 'scale', 'hex', ${q(ROLES[j])}, ${hb == null ? 'NULL' : hb});`,
    );
  });
}
process.stdout.write(lines.join('\n') + '\n');
