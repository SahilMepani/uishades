-- 0005_drop_handle - remove the public-handle feature.
-- The /u/[handle] public profile pages and the "set public handle" flow are
-- gone (palettes are reachable only via their /p/[slug] share link, never by
-- browsing another user's profile), so the handle identity columns added in
-- 0004 are now dead. Drop the UNIQUE index first, then the columns.
DROP INDEX IF EXISTS idx_users_handle;
ALTER TABLE users DROP COLUMN display_name;
ALTER TABLE users DROP COLUMN handle;
