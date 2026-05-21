// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import cloudflare from '@astrojs/cloudflare';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
// Wave 2b (astro-routing) modification: surface the SSR-only `/[hex]` routes
// to crawlers via the sitemap. `@astrojs/sitemap` would otherwise only emit
// pre-rendered URLs (home + ~209 named-color pages), so without this Google
// would never find the popular hex set without warming each one by hand.
import { POPULAR_HEXES } from './src/lib/data/popular-hexes.ts';

// https://astro.build/config
// NOTE: In Astro 5+ the explicit `output: 'hybrid'` mode was removed and merged
// into `output: 'static'`. Static remains the default and individual routes can
// opt out of prerendering with `export const prerender = false` to be rendered
// on-demand by the adapter. This gives us the same hybrid behavior the plan
// asked for (pre-rendered curated set + SSR for arbitrary hexes at the edge).
export default defineConfig({
  site: 'https://shades.dev',
  output: 'static',
  adapter: cloudflare(),
  integrations: [
    react(),
    sitemap({
      // Inject the popular-hex URLs into the sitemap so Googlebot picks them
      // up on the first crawl. The static integration auto-includes the
      // pre-rendered pages on top of this list.
      customPages: POPULAR_HEXES.map(
        (h) => `https://shades.dev/${h.slice(1)}`
      ),
      // 2131 popular hex URLs + 209 named-color URLs + home fits comfortably
      // under the 5000-URL split threshold without a sitemap-index roll.
      entryLimit: 5000,
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});
