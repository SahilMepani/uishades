# shades.dev

A free, fast, ad-free shade generator. Mirrors the URL structure of
`0to255.com` (`/[hex]`, `/colors/[name]`) and ships an OKLCH-based algorithm
for visibly cleaner shades, with Tailwind / design-token exports.

## Local development

```sh
npm install
npm run dev
```

Dev server runs at <http://localhost:4321>.

## Build

```sh
npm run build
```

Outputs the static site + Cloudflare Pages adapter bundle to `dist/`.

## Test

```sh
npm test          # Vitest unit tests (color math, parsers)
npm run test:e2e  # Playwright end-to-end tests (Chromium, Firefox, WebKit)
```

`npm run test:watch` runs Vitest in watch mode.

## Lighthouse

```sh
npm run lhci      # Lighthouse CI against the three audited routes
```

## Deploy

Deployment is automatic: pushes to `main` trigger the
`.github/workflows/deploy.yml` workflow, which builds and ships to
Cloudflare Pages (project `shades-dev`).

Required repository secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

See `.env.example` for the full list.

## Plan

The full implementation plan lives at
`C:\Users\SAHIL\.claude\plans\do-you-know-https-0to255-com-harmonic-mountain.md`.
