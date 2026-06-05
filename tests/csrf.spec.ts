/**
 * Same-origin CSRF gate (regression for the login-CSRF on the magic-link
 * callback). Astro's built-in origin check IS active in production - the
 * `@astrojs/cloudflare` adapter declares `buildOutput: 'server'`, so Astro
 * computes `checkOrigin = true` despite `output: 'static'`. This middleware gate
 * is a stricter superset (it also blocks cross-origin application/json POSTs and
 * honors Sec-Fetch-Site); here we test the pure logic it delegates to.
 */
import { describe, it, expect } from 'vitest';
import { isSameOrigin, isCsrfBlocked } from '../src/lib/auth/csrf';

function req(method: string, headers: Record<string, string> = {}): Request {
  return new Request('https://uishades.com/x', { method, headers });
}
const u = (path: string) => new URL(`https://uishades.com${path}`);

describe('isSameOrigin', () => {
  it('passes when Origin equals the site origin', () => {
    expect(isSameOrigin(req('POST', { Origin: 'https://uishades.com' }), u('/api/presets'))).toBe(true);
  });

  it('rejects a cross-origin Origin', () => {
    expect(isSameOrigin(req('POST', { Origin: 'https://evil.com' }), u('/api/presets'))).toBe(false);
  });

  it('falls back to Sec-Fetch-Site when Origin is absent', () => {
    expect(isSameOrigin(req('POST', { 'Sec-Fetch-Site': 'same-origin' }), u('/api/presets'))).toBe(true);
    expect(isSameOrigin(req('POST', { 'Sec-Fetch-Site': 'cross-site' }), u('/api/presets'))).toBe(false);
  });

  it('rejects when neither Origin nor Sec-Fetch-Site is present', () => {
    expect(isSameOrigin(req('POST'), u('/api/presets'))).toBe(false);
  });

  it('treats an empty-string Origin as absent and falls through to Sec-Fetch-Site', () => {
    // Some runtimes surface a missing Origin as '' rather than null; the truthy
    // check must not compare '' against the origin (which would always fail).
    expect(isSameOrigin(req('POST', { Origin: '', 'Sec-Fetch-Site': 'same-origin' }), u('/api/presets'))).toBe(true);
    expect(isSameOrigin(req('POST', { Origin: '' }), u('/api/presets'))).toBe(false);
  });
});

describe('isCsrfBlocked', () => {
  it('blocks a cross-origin POST to the magic-link callback (the login-CSRF path)', () => {
    expect(isCsrfBlocked(req('POST', { Origin: 'https://evil.com' }), u('/api/auth/magic/callback'))).toBe(true);
  });

  it('blocks a cross-origin POST/DELETE to presets', () => {
    expect(isCsrfBlocked(req('POST', { Origin: 'https://evil.com' }), u('/api/presets'))).toBe(true);
    expect(isCsrfBlocked(req('DELETE', { Origin: 'https://evil.com' }), u('/api/presets/abc'))).toBe(true);
  });

  it('allows a same-origin state-changing request through to the handler', () => {
    expect(isCsrfBlocked(req('POST', { Origin: 'https://uishades.com' }), u('/api/presets'))).toBe(false);
  });

  it('blocks a cross-origin POST to palettes (create)', () => {
    expect(isCsrfBlocked(req('POST', { Origin: 'https://evil.com' }), u('/api/palettes'))).toBe(true);
    expect(isSameOrigin(req('POST', { Origin: 'https://evil.com' }), u('/api/palettes'))).toBe(false);
  });

  it('blocks a cross-origin POST to a nested palettes route (vote)', () => {
    expect(isCsrfBlocked(req('POST', { Origin: 'https://evil.com' }), u('/api/palettes/abc/vote'))).toBe(true);
    expect(isSameOrigin(req('POST', { Origin: 'https://evil.com' }), u('/api/palettes/abc/vote'))).toBe(false);
  });

  it('allows same-origin state-changing requests to palettes and its nested routes', () => {
    expect(isCsrfBlocked(req('POST', { Origin: 'https://uishades.com' }), u('/api/palettes'))).toBe(false);
    expect(isCsrfBlocked(req('POST', { Origin: 'https://uishades.com' }), u('/api/palettes/abc/vote'))).toBe(false);
    expect(isCsrfBlocked(req('PATCH', { Origin: 'https://uishades.com' }), u('/api/palettes/abc'))).toBe(false);
  });

  it('ignores GET — OAuth callbacks are GET and protected by state/PKCE', () => {
    expect(isCsrfBlocked(req('GET', { Origin: 'https://evil.com' }), u('/api/auth/google/callback'))).toBe(false);
  });

  it('ignores unprotected paths such as the public hex JSON', () => {
    expect(isCsrfBlocked(req('POST', { Origin: 'https://evil.com' }), u('/api/4040ff.json'))).toBe(false);
  });
});
