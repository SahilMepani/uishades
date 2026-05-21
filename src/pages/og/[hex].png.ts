// Wave 0 placeholder. Wave 2b will implement the Satori-based OG image
// generator using `workers-og` running on Cloudflare Workers. Cached at
// the edge for 30 days. Until then, an empty paths list keeps the build
// passing under `output: 'static'`.
import type { APIRoute } from 'astro';

export function getStaticPaths() {
  return [];
}

export const GET: APIRoute = () =>
  new Response('Not implemented', { status: 501 });
