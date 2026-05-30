-- 0004_palettes — multi-color palettes, sharing, voting, public profiles.
-- The existing `presets` table is left UNTOUCHED for back-compat; a one-time
-- backfill (backfillPresetsToPalettes in db.ts, run from a script) copies each
-- legacy preset into a 1-color PRIVATE palette so no saved work leaks public.

-- Billing hooks (unused in v1, default keeps everyone free; lets the future
-- paywall be a code change, not a migration).
ALTER TABLE users ADD COLUMN plan TEXT NOT NULL DEFAULT 'free';   -- 'free' | 'pro'
ALTER TABLE users ADD COLUMN plan_until INTEGER;                  -- epoch ms, future gate

-- Public identity for /u/[handle] profile pages. email stays private.
ALTER TABLE users ADD COLUMN handle TEXT;                         -- UNIQUE public key, NULL until set
ALTER TABLE users ADD COLUMN display_name TEXT;                   -- public name on cards (falls back to handle)
CREATE UNIQUE INDEX idx_users_handle ON users(handle);           -- partial-unique: NULLs allowed, set values unique

CREATE TABLE palettes (
  id          TEXT PRIMARY KEY,                       -- uuid
  user_id     TEXT NOT NULL REFERENCES users(id),
  name        TEXT NOT NULL,
  slug        TEXT UNIQUE NOT NULL,                   -- kebab(name)+4char base36; stable
  visibility  TEXT NOT NULL DEFAULT 'public',         -- 'public' | 'private' (private = future Pro)
  description TEXT,
  tags        TEXT,                                   -- json array, curated subset only
  flagged     INTEGER NOT NULL DEFAULT 0,             -- moderation: hide from /explore
  view_count  INTEGER NOT NULL DEFAULT 0,
  vote_count  INTEGER NOT NULL DEFAULT 0,             -- denormalized upvote tally for "Top" sort
  featured    INTEGER NOT NULL DEFAULT 0,             -- founder-curated "Featured" collection (manual)
  featured_at INTEGER,                                -- when featured, for ordering the collection
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX idx_palettes_user   ON palettes(user_id);
CREATE INDEX idx_palettes_new    ON palettes(visibility, flagged, created_at DESC);  -- "New" sort
CREATE INDEX idx_palettes_top    ON palettes(visibility, flagged, vote_count DESC);  -- "Top" sort
CREATE INDEX idx_palettes_feat   ON palettes(featured, featured_at DESC);            -- "Featured" collection
-- "Trending" = vote_count weighted by recency, computed in the query.

CREATE TABLE palette_colors (
  palette_id  TEXT NOT NULL REFERENCES palettes(id) ON DELETE CASCADE,
  position    INTEGER NOT NULL,
  hex         TEXT NOT NULL,                          -- canonical #rrggbb from parseColor
  view        TEXT NOT NULL DEFAULT 'scale',
  copy_format TEXT,
  role        TEXT,                                   -- bg|surface|accent|text|extra
  hue_bucket  INTEGER,                                -- 0..11 OKLCH hue family (NULL if achromatic), for color filter
  PRIMARY KEY (palette_id, position)
);
CREATE INDEX idx_palette_colors_hue ON palette_colors(hue_bucket);  -- filter-by-color join

-- One upvote per user per palette. Existence of a row IS the vote (no value column);
-- the PRIMARY KEY makes a double-vote a no-op insert. vote_count is kept in sync.
CREATE TABLE palette_votes (
  palette_id  TEXT NOT NULL REFERENCES palettes(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES users(id),
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (palette_id, user_id)
);
CREATE INDEX idx_palette_votes_user ON palette_votes(user_id);  -- "did I vote?" + a user's voted list
