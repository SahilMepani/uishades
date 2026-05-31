-- 0001_init - auth + presets schema for UIshades.com
-- Users are keyed on a *verified* email; that email is the linking key across
-- Google OAuth, GitHub OAuth, and magic-link login (find-or-create-by-email).

CREATE TABLE users (
  id          TEXT PRIMARY KEY,        -- uuid (crypto.randomUUID)
  email       TEXT UNIQUE NOT NULL,    -- verified email; the linking key
  name        TEXT,
  avatar_url  TEXT,
  created_at  INTEGER NOT NULL
);

CREATE TABLE oauth_accounts (
  provider          TEXT NOT NULL,     -- 'google' | 'github'
  provider_user_id  TEXT NOT NULL,
  user_id           TEXT NOT NULL REFERENCES users(id),
  PRIMARY KEY (provider, provider_user_id)
);

CREATE TABLE magic_link_tokens (
  token_hash  TEXT PRIMARY KEY,        -- sha256(raw token); raw token only ever in the emailed URL
  email       TEXT NOT NULL,
  expires_at  INTEGER NOT NULL         -- ~15 min TTL, single-use (deleted on consume)
);

CREATE TABLE presets (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id),
  name          TEXT NOT NULL,
  hex           TEXT NOT NULL,
  view          TEXT NOT NULL,         -- 'scale' | 'ramp'
  copy_format   TEXT,
  export_format TEXT,
  created_at    INTEGER NOT NULL
);

CREATE INDEX idx_presets_user ON presets(user_id);
