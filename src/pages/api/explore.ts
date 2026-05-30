/**
 * GET /api/explore — the public palette gallery feed.
 *
 * Params (all optional):
 *   - sort=top|new|trending|featured (default 'top'; anything else clamps to it)
 *   - tag=<curated tag>             — JSON-substring match on a palette's tags
 *   - color=<hex>                   — parsed → `hueBucket()` server-side, filters
 *                                     to palettes containing that hue family
 *   - cursor=<opaque token>         — the `nextCursor` from a prior page; passed
 *                                     straight back to `listPublicPalettes`
 *
 * Caching is the subtle bit: the body depends on whether a session exists
 * (`votedByMe` is per-user). With NO session the response is identical for every
 * visitor and the default sort is the SSR'd `/explore` first paint, so it's
 * **public, short-TTL cacheable**. WITH a session it carries the viewer's votes
 * and MUST be `private, no-store`. We branch the Cache-Control on session
 * presence and add `Vary: Cookie` so a shared cache can't serve a signed-in
 * (private) body to an anonymous request or vice-versa.
 */
export const prerender = false;

import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { listPublicPalettes } from '../../lib/auth/db';
import type { ExploreSort } from '../../lib/auth/db';
import { currentUserId } from '../../lib/auth/session';
import { hueBucket } from '../../lib/color/hue';
import { parseColor } from '../../lib/color/parse';

const SORTS: readonly ExploreSort[] = ['top', 'new', 'trending', 'featured'];
const TAG_MAX = 40;

export const GET: APIRoute = async ({ url, session }) => {
  const params = url.searchParams;

  // sort — clamp anything unrecognized to the default 'top'.
  const rawSort = params.get('sort') ?? 'top';
  const sort: ExploreSort = (SORTS as readonly string[]).includes(rawSort)
    ? (rawSort as ExploreSort)
    : 'top';

  // tag — bounded, non-empty curated facet; empty/oversized is ignored.
  const rawTag = (params.get('tag') ?? '').trim().slice(0, TAG_MAX);
  const tag = rawTag || undefined;

  // color — parse a hex and snap to its hue bucket. Invalid input or an
  // achromatic color (bucket null) means "no color filter".
  let hueBucketFilter: number | null | undefined;
  const rawColor = params.get('color');
  if (rawColor) {
    try {
      hueBucketFilter = hueBucket(parseColor(rawColor));
    } catch {
      hueBucketFilter = undefined;
    }
    // A parseable-but-achromatic color yields null → treat as no filter.
    if (hueBucketFilter == null) hueBucketFilter = undefined;
  }

  const cursor = params.get('cursor');

  // Optional session: drives `votedByMe` and flips the cache policy.
  const viewerId = await currentUserId(session);

  const result = await listPublicPalettes(env.DB, {
    sort,
    tag,
    hueBucket: hueBucketFilter,
    cursor,
    viewerId,
  });

  const headers: Record<string, string> = {
    'content-type': 'application/json; charset=utf-8',
    vary: 'Cookie',
  };
  headers['cache-control'] = viewerId
    ? 'private, no-store'
    : 'public, max-age=60, s-maxage=300';

  return new Response(JSON.stringify(result), { status: 200, headers });
};
