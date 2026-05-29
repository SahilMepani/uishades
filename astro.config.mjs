// @ts-check
import { defineConfig, fontProviders } from 'astro/config';
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
  site: 'https://UIshades.com',
  output: 'static',
  // `platformProxy` exposes the wrangler.toml bindings (the `DB` D1 binding) to
  // the dev server so SSR routes can read them under `astro dev`. The SESSION
  // KV used by Astro Sessions is auto-wired by the adapter, so it doesn't need
  // a wrangler.toml entry. Access bindings/secrets at runtime via
  // `import { env } from 'cloudflare:workers'` (Astro 6 removed
  // `Astro.locals.runtime.env`).
  adapter: cloudflare({ platformProxy: { enabled: true } }),
  // Canonical URLs carry no trailing slash (mirrors 0to255: /[hex],
  // /colors/[name]). `format: 'file'` emits `colors/coral.html` instead of
  // `colors/coral/index.html`, so Cloudflare Pages serves the bare URL at 200
  // and redirects the slash variant to it — matching the no-slash <link
  // rel="canonical"> on every page. Without this, prerendered pages 307'd
  // `/colors/coral` → `/colors/coral/` while pointing canonical at the bare
  // URL (a self-referencing redirect crawlers downweight).
  trailingSlash: 'never',
  build: { format: 'file' },
  integrations: [
    react(),
    sitemap({
      // No-slash URLs (to match page canonicals) are inherited from the
      // top-level `trailingSlash: 'never'`. The integration has no own
      // `trailingSlash` option in this version — passing one aborts emission.
      // Inject the popular-hex URLs into the sitemap so Googlebot picks them
      // up on the first crawl. The static integration auto-includes the
      // pre-rendered pages on top of this list.
      customPages: POPULAR_HEXES.map(
        (h) => `https://UIshades.com/${h.slice(1)}`
      ),
      // Exclude the dev-only host page (`/dev/tool/`) from search engines.
      // It carries `<meta name="robots" content="noindex,nofollow">` already
      // but the sitemap is a stronger discovery signal we should not send.
      filter: (page) => !page.includes('/dev/'),
      // 2131 popular hex URLs + 209 named-color URLs + home fits comfortably
      // under the 5000-URL split threshold without a sitemap-index roll.
      entryLimit: 5000,
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
  // Self-host Geist and JetBrains Mono via Astro's fonts API. The integration
  // downloads woff2 files at build time, emits an @font-face rule with the
  // chosen `display` value, and (because `optimizedFallbacks` defaults to
  // true) generates a metric-overridden fallback @font-face so the
  // system-font fallback occupies the same box as the real webfont — no CLS
  // when the swap happens, and `display: 'optional'` means the user's first
  // paint isn't held up at all.
  fonts: [
    {
      name: 'Geist',
      cssVariable: '--font-geist',
      provider: fontProviders.google(),
      weights: [400, 500, 600, 700],
      styles: ['normal'],
      subsets: ['latin'],
      display: 'optional',
      fallbacks: [
        'ui-sans-serif',
        'system-ui',
        '-apple-system',
        'Segoe UI',
        'sans-serif',
      ],
    },
    {
      name: 'JetBrains Mono',
      cssVariable: '--font-jb-mono',
      provider: fontProviders.google(),
      weights: [400, 500, 600],
      styles: ['normal'],
      subsets: ['latin'],
      display: 'optional',
      fallbacks: [
        'ui-monospace',
        'SFMono-Regular',
        'Menlo',
        'monospace',
      ],
    },
  ],
});
