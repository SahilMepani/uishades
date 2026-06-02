/**
 * Edge Cache-API wrapper for expensive, deterministic GET responses (the OG
 * image renders). On Cloudflare it stores the rendered PNG in the per-colo
 * `caches.default`, keyed by request URL, so a repeat hit skips the heavy
 * Satori render and returns the bytes straight from cache.
 *
 * IMPORTANT — what this does and does NOT do:
 *   - DOES cut CPU + latency on repeat fetches of the same OG URL (Satori is
 *     the most expensive thing this site renders).
 *   - Does NOT reduce the Workers/Pages *request count*: the Function is still
 *     invoked on every request — it just does a cache.match instead of a render.
 *     To skip the Function entirely on repeats (and stop it counting toward the
 *     daily request limit), add a dashboard Cache Rule on `/og/*`. The robots
 *     rules + Bot Fight Mode are what keep crawlers from generating the hits in
 *     the first place.
 *
 * Falls back to a plain render when the Cache API is unavailable (e.g. `astro
 * dev`, where there's no real edge runtime), so callers behave identically
 * everywhere.
 */
export async function cachedResponse(
  request: Request,
  produce: () => Promise<Response> | Response,
): Promise<Response> {
  // `caches.default` is a Workers/Pages global; absent under plain Node/dev.
  const cache = (globalThis as { caches?: { default?: Cache } }).caches?.default;
  if (!cache || request.method !== 'GET') return produce();

  const hit = await cache.match(request);
  if (hit) return hit;

  const fresh = await produce();
  // Only store successful, explicitly-cacheable responses — never 404s.
  if (fresh.ok && fresh.headers.has('Cache-Control')) {
    try {
      await cache.put(request, fresh.clone());
    } catch {
      // Non-cacheable response or already-consumed body — serve fresh anyway.
    }
  }
  return fresh;
}
