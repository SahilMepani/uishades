/** Build-time date signals for JSON-LD freshness. */
export const DATE_PUBLISHED = '2026-05-24';
// Captured at build for prerendered pages; worker cold-start for the SSR hex route.
export const DATE_MODIFIED = new Date().toISOString().slice(0, 10);
