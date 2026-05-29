-- 0002_rate_limit — magic-link request throttling.
-- One row per magic-link request, keyed by `email:<addr>` and `ip:<addr>`.
-- The endpoint counts rows in the trailing window and prunes old ones, so
-- nobody can burn the Brevo quota or spam a victim's inbox.

CREATE TABLE magic_link_requests (
  key         TEXT NOT NULL,     -- 'email:<addr>' | 'ip:<addr>'
  created_at  INTEGER NOT NULL   -- epoch ms
);

CREATE INDEX idx_mlr_key_time ON magic_link_requests(key, created_at);
