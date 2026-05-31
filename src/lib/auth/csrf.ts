/**
 * Same-origin CSRF gate for state-changing API requests.
 *
 * Astro's built-in `security.checkOrigin` is silently a no-op under
 * `output: 'static'` (the manifest only enables it when buildOutput === 'server'),
 * so the auth + preset endpoints have no framework-level origin check.
 * `src/middleware.ts` enforces one explicitly on the SSR `/api/*` routes. The
 * logic lives here - free of `astro:` virtual-module imports - so it's
 * unit-testable.
 */

// State-changing requests under these prefixes must be same-origin. OAuth
// callbacks are GET (idempotent, protected by the OAuth state/PKCE check) and
// so are never gated here.
export const CSRF_PROTECTED_PREFIXES = ['/api/auth/', '/api/presets', '/api/feedback'];
const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * True when a state-changing request demonstrably originates from our own site.
 *
 * The `Origin` header is the primary, JS-unforgeable signal: every modern
 * browser sends it on a state-changing request (fetch and same-origin form
 * POST), so a matching `Origin` allows and a mismatching one blocks. `Origin`
 * absent (some runtimes surface this as `''`) falls through to `Sec-Fetch-Site`
 * as a belt-and-suspenders for the rare browser that omits `Origin` on a form
 * POST. Where the runtime doesn't expose `Sec-Fetch-Site` (e.g. it's stripped
 * before the request reaches us), this safely degrades to "require a matching
 * `Origin`" - still correct, since real browsers always send one.
 */
export function isSameOrigin(request: Request, url: URL): boolean {
  // Truthy check, not `!== null`: some runtimes surface an absent Origin as an
  // empty string rather than null, and we must fall through to Sec-Fetch-Site
  // in that case rather than comparing '' to the origin (which always fails).
  const origin = request.headers.get('Origin');
  if (origin) return origin === url.origin;
  return request.headers.get('Sec-Fetch-Site') === 'same-origin';
}

/** True when this request must be rejected as a cross-origin CSRF attempt. */
export function isCsrfBlocked(request: Request, url: URL): boolean {
  return (
    STATE_CHANGING_METHODS.has(request.method) &&
    CSRF_PROTECTED_PREFIXES.some((p) => url.pathname.startsWith(p)) &&
    !isSameOrigin(request, url)
  );
}
