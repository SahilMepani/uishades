// Generates the demo images offered under the image picker on
// `/image-color-picker` (see `src/components/ImagePalettePanel.tsx`). The set is
// deliberately varied so a visitor can feel how extraction behaves on different
// kinds of source art:
//
//   gradient.jpg  - a synthesized mesh gradient (smooth, blended hues)
//   logo.png      - a flat vector mark, solid colors on transparency (brand colors)
//   landscape.jpg - a flat layered illustration (a curated design palette)
//   photo.jpg     - a real photograph (organic, noisy color)
//
// gradient/logo/landscape are synthesized here (no third-party license). photo
// is fetched from Lorem Picsum:
//   "Strawberries" by veeterzy - https://unsplash.com/photos/OJJIaFZOeX4
//   Unsplash License (free to use, attribution appreciated). Mirrored in
//   public/samples/CREDITS.txt.
//
// Re-run after editing to regenerate everything (needs network for the photo):
//   node scripts/generate-sample-images.mjs

import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../public/samples');
const W = 1200;
const H = 900;

await mkdir(OUT_DIR, { recursive: true });

// --- gradient.jpg -----------------------------------------------------------
// A base fill plus radial "blobs" (color → fully transparent) painted in order.
// They overlap into a smooth mesh while keeping their core hues distinct.
const GRADIENT_BLOBS = [
  { cx: 0.25, cy: 0.22, r: 0.6, color: '#f472b6' },
  { cx: 0.8, cy: 0.3, r: 0.6, color: '#a78bfa' },
  { cx: 0.78, cy: 0.8, r: 0.62, color: '#7c3aed' },
  { cx: 0.22, cy: 0.82, r: 0.58, color: '#fb7185' },
];
function gradientSvg() {
  const grads = GRADIENT_BLOBS.map(
    (b, i) => `
    <radialGradient id="g${i}" cx="${b.cx}" cy="${b.cy}" r="${b.r}" gradientUnits="objectBoundingBox">
      <stop offset="0" stop-color="${b.color}" stop-opacity="0.95" />
      <stop offset="0.6" stop-color="${b.color}" stop-opacity="0.45" />
      <stop offset="1" stop-color="${b.color}" stop-opacity="0" />
    </radialGradient>`,
  ).join('');
  const rects = GRADIENT_BLOBS.map((_, i) => `  <rect width="${W}" height="${H}" fill="url(#g${i})" />`).join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>${grads}
  </defs>
  <rect width="${W}" height="${H}" fill="#1b0f2e" />
${rects}
</svg>`;
}

// --- logo.png ---------------------------------------------------------------
// A fanned stack of rounded "cards" in four solid brand colors on a transparent
// ground - the transparent margin is skipped by the extractor (ALPHA_MIN), so a
// click extracts exactly the four logo colors. Reads as a swatch/palette mark.
function logoSvg() {
  const colors = ['#f43f5e', '#f59e0b', '#14b8a6', '#4f46e5'];
  const angles = [-30, -10, 10, 30];
  const pivotX = 600;
  const pivotY = 720;
  const cards = colors
    .map(
      (c, i) =>
        `  <g transform="rotate(${angles[i]} ${pivotX} ${pivotY})"><rect x="480" y="320" width="240" height="400" rx="32" fill="${c}" /></g>`,
    )
    .join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
${cards}
</svg>`;
}

// --- landscape.jpg ----------------------------------------------------------
// A flat, layered illustration: pale sky, a warm sun, and four receding hill
// silhouettes in cool teals/blues. Each region is one solid color, so it yields
// a clean, curated six-color palette - the best showcase for a palette tool.
function landscapeSvg() {
  const sky = '#cdeafe';
  const sun = '#ffd56b';
  const layers = [
    { color: '#7fd1c4', top: [[0, 420], [200, 360], [400, 420], [600, 370], [800, 430], [1000, 380], [1200, 415]] },
    { color: '#3aa9a0', top: [[0, 500], [150, 450], [350, 505], [550, 460], [780, 512], [980, 470], [1200, 498]] },
    { color: '#2c7da0', top: [[0, 580], [250, 540], [480, 592], [700, 548], [920, 600], [1200, 560]] },
    { color: '#1d3f72', top: [[0, 662], [300, 628], [600, 682], [900, 640], [1200, 668]] },
  ];
  const hills = layers
    .map((l) => {
      const pts = [...l.top.map(([x, y]) => `${x},${y}`), `${W},${H}`, `0,${H}`].join(' ');
      return `  <polygon points="${pts}" fill="${l.color}" />`;
    })
    .join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${sky}" />
  <circle cx="880" cy="210" r="110" fill="${sun}" />
${hills}
</svg>`;
}

async function rasterize(svg, file, format) {
  const out = resolve(OUT_DIR, file);
  const img = sharp(Buffer.from(svg));
  if (format === 'png') await img.png().toFile(out);
  else await img.jpeg({ quality: 82, mozjpeg: true }).toFile(out);
  console.log(`wrote ${out}`);
}

await rasterize(gradientSvg(), 'gradient.jpg', 'jpeg');
await rasterize(logoSvg(), 'logo.png', 'png');
await rasterize(landscapeSvg(), 'landscape.jpg', 'jpeg');

// --- photo.jpg --------------------------------------------------------------
const PHOTO_URL = 'https://picsum.photos/id/1080/1200/800';
try {
  const res = await fetch(PHOTO_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const out = resolve(OUT_DIR, 'photo.jpg');
  await sharp(buf)
    .rotate() // bake EXIF orientation, then drop metadata
    .resize({ width: 1200, height: 900, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true })
    .toFile(out);
  console.log(`wrote ${out}`);
} catch (err) {
  console.warn(`SKIPPED photo.jpg (${err.message}) - existing file, if any, left in place`);
}

// Fail loudly if a clean run produced no photo.jpg (fetch failed with nothing on
// disk), so regenerating on a fresh tree can't silently ship a broken set - the
// Photo sample would 404. A re-run that kept an existing photo.jpg passes.
if (!existsSync(resolve(OUT_DIR, 'photo.jpg'))) {
  console.error('ERROR: photo.jpg missing (fetch failed on a clean tree). Re-run with network access.');
  process.exitCode = 1;
}

await writeFile(
  resolve(OUT_DIR, 'CREDITS.txt'),
  [
    'Sample images for /image-color-picker',
    '',
    'gradient.jpg, logo.png, landscape.jpg — generated by',
    'scripts/generate-sample-images.mjs (no third-party license).',
    '',
    'photo.jpg — "Strawberries" by veeterzy, https://unsplash.com/photos/OJJIaFZOeX4',
    'Unsplash License (https://unsplash.com/license). Sourced via Lorem Picsum.',
    '',
  ].join('\n'),
);
console.log('done');
