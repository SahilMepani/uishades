/**
 * sitemap-seed - build-time static seed for the SSR-only `/p/[slug]` palette
 * pages that `@astrojs/sitemap` can't otherwise enumerate (they're rendered
 * on-demand, so the integration never sees them).
 *
 * WHY A STATIC SEED (and not a live D1 query): `astro.config.mjs` runs in the
 * build process, where the Cloudflare `DB` binding is NOT available (bindings
 * exist only at request time inside the Worker). So we cannot `SELECT` featured
 * / top-voted slugs here. Instead this module exports a best-effort static list
 * that is injected into the sitemap alongside `POPULAR_HEXES`.
 *
 * HOW TO KEEP IT FRESH (the hook): regenerate this array from D1 as a build
 * step / scheduled job, e.g.
 *
 *   wrangler d1 execute uishades --remote --json --command \
 *     "SELECT slug FROM palettes WHERE visibility='public' AND flagged=0 \
 *      ORDER BY featured DESC, vote_count DESC LIMIT 500"
 *
 * and write the results into the array below before `npm run build`. Until that
 * automation lands it stays empty - that's safe: Googlebot still discovers
 * `/p/*` via in-page links from `/explore` and the cards, and the existing
 * `POPULAR_HEXES` sitemap injection is unaffected.
 *
 * Flagged palettes MUST never appear here (they're excluded from public
 * listings); the query above already filters them out.
 */

/** Public palette slugs to surface in the sitemap (featured + top-voted first). */
export const SITEMAP_PALETTE_SLUGS: readonly string[] = [];
