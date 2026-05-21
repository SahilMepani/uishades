// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import cloudflare from '@astrojs/cloudflare';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

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
  integrations: [react(), sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
});
