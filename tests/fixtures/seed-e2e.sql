-- Deterministic e2e fixture: one public, featured palette with a STABLE slug so
-- the suite can exercise the happy paths (a real palette page and a non-empty
-- Explore) — not just the 404 misses. Applied to the local preview D1 in CI
-- after migrations. Fixed ids/slug; no randomness.
-- (A missing valid-palette test is exactly what let an Astro v6
-- `locals.runtime.ctx` 500 ship undetected on /p/[slug].)
INSERT OR IGNORE INTO users (id, email, name, avatar_url, created_at, plan, plan_until)
VALUES ('e2e00000-0000-4000-8000-000000000001', 'e2e@example.test', 'E2E User', NULL, 0, 'free', NULL);

INSERT OR IGNORE INTO palettes (id, user_id, name, slug, visibility, description, tags, flagged, view_count, vote_count, featured, featured_at, created_at, updated_at)
VALUES ('e2ep0001-0000-4000-8000-000000000001', 'e2e00000-0000-4000-8000-000000000001', 'E2E Fixture', 'e2e-fixture-palette', 'public', NULL, '["cool"]', 0, 0, 0, 1, 0, 0, 0);

INSERT OR IGNORE INTO palette_colors (palette_id, position, hex, view, copy_format, role, hue_bucket) VALUES
  ('e2ep0001-0000-4000-8000-000000000001', 0, '#f0f4ff', 'scale', 'hex', 'bg', NULL),
  ('e2ep0001-0000-4000-8000-000000000001', 1, '#cdd9ff', 'scale', 'hex', 'surface', 9),
  ('e2ep0001-0000-4000-8000-000000000001', 2, '#4040ff', 'scale', 'hex', 'accent', 9),
  ('e2ep0001-0000-4000-8000-000000000001', 3, '#0a1033', 'scale', 'hex', 'text', 9);
