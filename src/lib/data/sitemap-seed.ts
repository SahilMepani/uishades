/**
 * sitemap-seed — build-time static seed for the SSR-only `/p/[slug]` palette
 * pages and `/u/[handle]` profile pages that `@astrojs/sitemap` can't otherwise
 * enumerate (they're rendered on-demand, so the integration never sees them).
 *
 * WHY A STATIC SEED (and not a live D1 query): `astro.config.mjs` runs in the
 * build process, where the Cloudflare `DB` binding is NOT available (bindings
 * exist only at request time inside the Worker). So we cannot `SELECT` featured
 * / top-voted slugs and active handles here. Instead this module exports
 * best-effort static lists that are injected into the sitemap alongside
 * `POPULAR_HEXES`.
 *
 * HOW TO KEEP IT FRESH (the hook): regenerate these arrays from D1 as a build
 * step / scheduled job, e.g.
 *
 *   wrangler d1 execute uishades --remote --json --command \
 *     "SELECT slug FROM palettes WHERE visibility='public' AND flagged=0 \
 *      ORDER BY featured DESC, vote_count DESC LIMIT 500"
 *   wrangler d1 execute uishades --remote --json --command \
 *     "SELECT handle FROM users WHERE handle IS NOT NULL LIMIT 500"
 *
 * and write the results into the two arrays below before `npm run build`.
 * Until that automation lands these stay empty — that's safe: Googlebot still
 * discovers `/p/*` and `/u/*` via in-page links from `/explore` and the cards,
 * and the existing `POPULAR_HEXES` sitemap injection is unaffected.
 *
 * Flagged palettes and unset handles MUST never appear here (they're excluded
 * from public listings); the query above already filters them out.
 */

/** Public palette slugs to surface in the sitemap (featured + top-voted first). */
export const SITEMAP_PALETTE_SLUGS: readonly string[] = [];

/** Active public profile handles (handle set) to surface in the sitemap. */
export const SITEMAP_PROFILE_HANDLES: readonly string[] = [];
