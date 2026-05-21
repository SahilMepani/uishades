// Wave 0 placeholder. Wave 2b will implement the JSON API endpoint
// returning `ColorPageData` (ramp + scale + neighbors) for the given hex.
// Edge-cached. Until then, an empty paths list keeps the build passing
// under `output: 'static'`.
import type { APIRoute } from 'astro';

export function getStaticPaths() {
  return [];
}

export const GET: APIRoute = () =>
  new Response(JSON.stringify({ error: 'Not implemented' }), {
    status: 501,
    headers: { 'content-type': 'application/json' },
  });
