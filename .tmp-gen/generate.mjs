/**
 * One-shot generator for src/lib/data/named-colors.ts and src/lib/data/popular-hexes.ts.
 *
 * Run from project root: `node .tmp-gen/generate.mjs`.
 * Writes to .tmp-gen/named-colors.partial.json and .tmp-gen/popular-hexes.json.
 * The TS files themselves are hand-authored to embed the blurbs.
 *
 * What this does:
 *   - Reads node_modules/tailwindcss/theme.css and converts every
 *     --color-<hue>-<stop> OKLCH triple to a canonical lowercase hex.
 *   - Iterates culori.colorsNamed (CSS Named Colors) for the 140-ish entries.
 *   - Adds Material Design palette key shades and Bootstrap defaults.
 *   - Builds a synthetic 1000-entry OKLCH-distributed sample for popular brand-like hexes.
 *   - De-dupes, sorts, and emits JSON for the TS authoring step.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  colorsNamed,
  clampChroma,
  formatHex,
  oklch,
  parse as culoriParse,
  converter,
  differenceEuclidean,
} from 'culori';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function intToHex(n) {
  return '#' + n.toString(16).padStart(6, '0').toLowerCase();
}

function oklchToHex(lPct, c, h) {
  const col = { mode: 'oklch', l: lPct / 100, c, h };
  // Gamut-map into sRGB; formatHex handles the rest.
  const inGamut = clampChroma(col, 'oklch', 'rgb');
  const hex = formatHex(inGamut);
  return hex.toLowerCase();
}

function normalizeHex(h) {
  if (!h) return null;
  const s = h.trim().toLowerCase();
  // Already #rrggbb?
  if (/^#[0-9a-f]{6}$/.test(s)) return s;
  if (/^#[0-9a-f]{3}$/.test(s)) {
    // Expand shorthand.
    return '#' + [...s.slice(1)].map((ch) => ch + ch).join('');
  }
  // Use culori's parser as a last resort.
  const parsed = culoriParse(s);
  if (!parsed) return null;
  return formatHex(parsed).toLowerCase();
}

const toOklch = converter('oklch');

/* ------------------------------------------------------------------ */
/*  CSS Named Colors                                                   */
/* ------------------------------------------------------------------ */

// Synonym pairs to fold into the canonical entry (kept as alias).
const CSS_ALIASES = {
  // canonical → list of aliases
  cyan: ['aqua'],
  magenta: ['fuchsia'],
  gray: ['grey'],
  darkgray: ['darkgrey'],
  darkslategray: ['darkslategrey'],
  dimgray: ['dimgrey'],
  lightgray: ['lightgrey'],
  lightslategray: ['lightslategrey'],
  slategray: ['slategrey'],
};
// Reverse lookup: alias → canonical
const ALIAS_TO_CANONICAL = {};
for (const [canon, list] of Object.entries(CSS_ALIASES)) {
  for (const a of list) ALIAS_TO_CANONICAL[a] = canon;
}

const cssNamedRaw = [];
for (const [name, intVal] of Object.entries(colorsNamed)) {
  cssNamedRaw.push({ name, hex: intToHex(intVal) });
}
// Drop aliases (we keep them in `aliases` on the canonical).
const cssNamed = cssNamedRaw.filter((c) => !ALIAS_TO_CANONICAL[c.name]);

/* ------------------------------------------------------------------ */
/*  Tailwind v4 palette                                                */
/* ------------------------------------------------------------------ */

const themeCss = fs.readFileSync(
  path.join(projectRoot, 'node_modules/tailwindcss/theme.css'),
  'utf8',
);

const TW_RE = /--color-([a-z]+)-(\d+):\s*oklch\(([0-9.]+)%\s+([0-9.]+)\s+([0-9.]+)\)/g;
const tailwindAll = []; // {hue, stop, hex}
{
  let m;
  while ((m = TW_RE.exec(themeCss)) !== null) {
    const [, hue, stop, l, c, h] = m;
    tailwindAll.push({
      hue,
      stop: Number(stop),
      hex: oklchToHex(Number(l), Number(c), Number(h)),
    });
  }
}

// 22 canonical hues per task spec
const TW_22_HUES = [
  'slate', 'gray', 'zinc', 'neutral', 'stone',
  'red', 'orange', 'amber', 'yellow', 'lime',
  'green', 'emerald', 'teal', 'cyan', 'sky',
  'blue', 'indigo', 'violet', 'purple', 'fuchsia',
  'pink', 'rose',
];

const tailwindForNamed = tailwindAll.filter(
  (t) => TW_22_HUES.includes(t.hue) && (t.stop === 500 || t.stop === 600),
);

/* ------------------------------------------------------------------ */
/*  Material Design palette key shades (M2 500-stops; widely searched) */
/* ------------------------------------------------------------------ */

const MATERIAL = [
  { name: 'red',         hex: '#f44336' },
  { name: 'pink',        hex: '#e91e63' },
  { name: 'purple',      hex: '#9c27b0' },
  { name: 'deep-purple', hex: '#673ab7' },
  { name: 'indigo',      hex: '#3f51b5' },
  { name: 'blue',        hex: '#2196f3' },
  { name: 'light-blue',  hex: '#03a9f4' },
  { name: 'cyan',        hex: '#00bcd4' },
  { name: 'teal',        hex: '#009688' },
  { name: 'green',       hex: '#4caf50' },
];

/* ------------------------------------------------------------------ */
/*  Bootstrap 5 default theme colors                                   */
/* ------------------------------------------------------------------ */

const BOOTSTRAP = [
  { name: 'primary',   hex: '#0d6efd' },
  { name: 'secondary', hex: '#6c757d' },
  { name: 'success',   hex: '#198754' },
  { name: 'danger',    hex: '#dc3545' },
  { name: 'warning',   hex: '#ffc107' },
  { name: 'info',      hex: '#0dcaf0' },
  { name: 'light',     hex: '#f8f9fa' },
  { name: 'dark',      hex: '#212529' },
  { name: 'teal',      hex: '#20c997' }, // bootstrap teal accent
  { name: 'indigo',    hex: '#6610f2' }, // bootstrap indigo accent
];

/* ------------------------------------------------------------------ */
/*  Curated brand-y names                                              */
/* ------------------------------------------------------------------ */

const CURATED = [
  { slug: 'midnight-blue', name: 'Midnight Blue', hex: '#191970' },
  { slug: 'seafoam',       name: 'Seafoam',       hex: '#93e9be' },
  { slug: 'terracotta',    name: 'Terracotta',    hex: '#e2725b' },
  { slug: 'dusty-rose',    name: 'Dusty Rose',    hex: '#dcae96' },
  { slug: 'forest-green',  name: 'Forest Green',  hex: '#228b22' }, // matches CSS forestgreen — will be deduped
  { slug: 'slate-gray',    name: 'Slate Gray',    hex: '#708090' }, // matches CSS slategray — will be deduped
  { slug: 'champagne',     name: 'Champagne',     hex: '#f7e7ce' },
  { slug: 'burnt-orange',  name: 'Burnt Orange',  hex: '#cc5500' },
  { slug: 'mustard',       name: 'Mustard',       hex: '#ffdb58' },
  { slug: 'lavender',      name: 'Lavender',      hex: '#e6e6fa' }, // matches CSS lavender — will be deduped
];

/* ------------------------------------------------------------------ */
/*  Family classifier                                                  */
/* ------------------------------------------------------------------ */

// Family hue ranges in OKLCH (degrees). Approximate — works well at typical chroma.
// Achromatic (low chroma) routes to gray/neutral by lightness.
function familyOf(hex) {
  const c = toOklch(hex);
  if (!c) return 'neutral';
  // Low chroma -> achromatic.
  if (c.c < 0.025) {
    if (c.l < 0.18) return 'neutral';      // near-black
    if (c.l > 0.95) return 'neutral';      // near-white / off-white
    return 'gray';
  }
  const h = c.h ?? 0;
  // Brown band — warm hues (~15-80deg) at low-mid L with mid-low chroma.
  // Captures: brown (H=26,L=.48,C=.16), saddlebrown, sienna, peru, chocolate,
  // rosybrown, burnt-orange, terracotta. Tan/wheat/sandybrown are too light
  // and land in yellow/orange — that's fine, they read that way in design.
  if (h >= 15 && h <= 80 && c.l <= 0.70 && c.c <= 0.17 && c.l < 0.78) {
    return 'brown';
  }
  // Pink wraps across 0deg (335..10).
  if (h >= 335 || h < 10) {
    // High-L = pink; lower-L might still be pink or red. Bias to pink for warm-magenta.
    return 'pink';
  }
  if (h >= 10 && h < 35) return 'red';        // red, tomato, orangered, crimson
  if (h >= 35 && h < 75) return 'orange';     // orange, coral, darkorange
  if (h >= 75 && h < 120) return 'yellow';    // yellow, gold, beige (low-C), wheat
  if (h >= 120 && h < 170) return 'green';    // green, limegreen, forestgreen
  if (h >= 170 && h < 215) return 'teal';     // teal, cyan, aquamarine, turquoise
  if (h >= 215 && h < 278) return 'blue';     // blue, navy, royalblue, dodgerblue
  if (h >= 278 && h < 312) return 'indigo';   // indigo, blueviolet, rebeccapurple, slateblue
  if (h >= 312 && h < 335) return 'purple';   // purple, magenta, violet, orchid
  return 'neutral';
}

/* ------------------------------------------------------------------ */
/*  Build the NamedColor staging list                                  */
/* ------------------------------------------------------------------ */

const staging = []; // { slug, name, hex, family, source, aliases?, namedSlugAliases? }

function pushUniqueByHex(entry) {
  const existing = staging.find((s) => s.hex === entry.hex);
  if (existing) {
    // Merge: keep first entry's canonical slug, append the new name as alias.
    existing.aliases = existing.aliases || [];
    if (entry.slug !== existing.slug && !existing.aliases.includes(entry.slug)) {
      existing.aliases.push(entry.slug);
    }
    return existing;
  }
  staging.push(entry);
  return entry;
}

// Display-name overrides keyed by CSS slug. Generic algorithm splits common
// prefixes; this map cleans up the gnarly compound names.
const CSS_NAME_OVERRIDES = {
  aliceblue: 'Alice Blue',
  antiquewhite: 'Antique White',
  blanchedalmond: 'Blanched Almond',
  blueviolet: 'Blue Violet',
  burlywood: 'Burlywood',
  cadetblue: 'Cadet Blue',
  chartreuse: 'Chartreuse',
  cornflowerblue: 'Cornflower Blue',
  cornsilk: 'Cornsilk',
  darkblue: 'Dark Blue',
  darkcyan: 'Dark Cyan',
  darkgray: 'Dark Gray',
  darkgreen: 'Dark Green',
  darkgoldenrod: 'Dark Goldenrod',
  darkkhaki: 'Dark Khaki',
  darkmagenta: 'Dark Magenta',
  darkolivegreen: 'Dark Olive Green',
  darkorange: 'Dark Orange',
  darkorchid: 'Dark Orchid',
  darkred: 'Dark Red',
  darksalmon: 'Dark Salmon',
  darkseagreen: 'Dark Sea Green',
  darkslateblue: 'Dark Slate Blue',
  darkslategray: 'Dark Slate Gray',
  darkturquoise: 'Dark Turquoise',
  darkviolet: 'Dark Violet',
  deeppink: 'Deep Pink',
  deepskyblue: 'Deep Sky Blue',
  dimgray: 'Dim Gray',
  dodgerblue: 'Dodger Blue',
  firebrick: 'Firebrick',
  floralwhite: 'Floral White',
  forestgreen: 'Forest Green',
  gainsboro: 'Gainsboro',
  ghostwhite: 'Ghost White',
  goldenrod: 'Goldenrod',
  greenyellow: 'Green Yellow',
  honeydew: 'Honeydew',
  hotpink: 'Hot Pink',
  indianred: 'Indian Red',
  lavenderblush: 'Lavender Blush',
  lawngreen: 'Lawn Green',
  lemonchiffon: 'Lemon Chiffon',
  lightblue: 'Light Blue',
  lightcoral: 'Light Coral',
  lightcyan: 'Light Cyan',
  lightgoldenrodyellow: 'Light Goldenrod Yellow',
  lightgray: 'Light Gray',
  lightgreen: 'Light Green',
  lightpink: 'Light Pink',
  lightsalmon: 'Light Salmon',
  lightseagreen: 'Light Sea Green',
  lightskyblue: 'Light Sky Blue',
  lightslategray: 'Light Slate Gray',
  lightsteelblue: 'Light Steel Blue',
  lightyellow: 'Light Yellow',
  limegreen: 'Lime Green',
  mediumaquamarine: 'Medium Aquamarine',
  mediumblue: 'Medium Blue',
  mediumorchid: 'Medium Orchid',
  mediumpurple: 'Medium Purple',
  mediumseagreen: 'Medium Sea Green',
  mediumslateblue: 'Medium Slate Blue',
  mediumspringgreen: 'Medium Spring Green',
  mediumturquoise: 'Medium Turquoise',
  mediumvioletred: 'Medium Violet Red',
  midnightblue: 'Midnight Blue',
  mintcream: 'Mint Cream',
  mistyrose: 'Misty Rose',
  navajowhite: 'Navajo White',
  oldlace: 'Old Lace',
  olivedrab: 'Olive Drab',
  orangered: 'Orange Red',
  palegoldenrod: 'Pale Goldenrod',
  palegreen: 'Pale Green',
  paleturquoise: 'Pale Turquoise',
  palevioletred: 'Pale Violet Red',
  papayawhip: 'Papaya Whip',
  peachpuff: 'Peach Puff',
  powderblue: 'Powder Blue',
  rebeccapurple: 'Rebecca Purple',
  rosybrown: 'Rosy Brown',
  royalblue: 'Royal Blue',
  saddlebrown: 'Saddle Brown',
  sandybrown: 'Sandy Brown',
  seagreen: 'Sea Green',
  seashell: 'Seashell',
  skyblue: 'Sky Blue',
  slateblue: 'Slate Blue',
  slategray: 'Slate Gray',
  springgreen: 'Spring Green',
  steelblue: 'Steel Blue',
  whitesmoke: 'White Smoke',
  yellowgreen: 'Yellow Green',
};

function cssDisplayName(slug) {
  if (CSS_NAME_OVERRIDES[slug]) return CSS_NAME_OVERRIDES[slug];
  return slug[0].toUpperCase() + slug.slice(1);
}

// 1. CSS named colors (canonical names).
for (const c of cssNamed) {
  const slug = c.name; // CSS spec slug, unhyphenated lowercase
  pushUniqueByHex({
    slug,
    name: cssDisplayName(slug),
    hex: c.hex,
    family: familyOf(c.hex),
    source: 'css',
    aliases: CSS_ALIASES[c.name] ? [...CSS_ALIASES[c.name]] : undefined,
  });
}

// 2. Tailwind v4 500/600 of the 22 canonical hues.
for (const t of tailwindForNamed) {
  const slug = `tailwind-${t.hue}-${t.stop}`;
  const display = `Tailwind ${t.hue[0].toUpperCase()}${t.hue.slice(1)} ${t.stop}`;
  pushUniqueByHex({
    slug,
    name: display,
    hex: t.hex,
    family: familyOf(t.hex),
    source: 'tailwind',
  });
}

// 3. Material.
for (const m of MATERIAL) {
  const slug = `material-${m.name}-500`;
  const titleHue = m.name.split('-').map((s) => s[0].toUpperCase() + s.slice(1)).join(' ');
  const display = `Material ${titleHue} 500`;
  pushUniqueByHex({
    slug,
    name: display,
    hex: m.hex.toLowerCase(),
    family: familyOf(m.hex),
    source: 'material',
  });
}

// 4. Bootstrap.
for (const b of BOOTSTRAP) {
  const slug = `bootstrap-${b.name}`;
  const display = `Bootstrap ${b.name[0].toUpperCase()}${b.name.slice(1)}`;
  pushUniqueByHex({
    slug,
    name: display,
    hex: b.hex.toLowerCase(),
    family: familyOf(b.hex),
    source: 'bootstrap',
  });
}

// 5. Curated.
for (const cu of CURATED) {
  pushUniqueByHex({
    slug: cu.slug,
    name: cu.name,
    hex: cu.hex.toLowerCase(),
    family: familyOf(cu.hex),
    source: 'curated',
  });
}

/* ------------------------------------------------------------------ */
/*  needsReview flagging                                               */
/* ------------------------------------------------------------------ */

const TW_500_SLUGS = TW_22_HUES.map((hue) => `tailwind-${hue}-500`);
const TOP_CSS_NAMES = [
  // 28 most-searched CSS named colors — the task's heuristic list.
  // After alias-fold: aqua→cyan, fuchsia→magenta — both still in 28 as 'cyan' and 'magenta'.
  'red', 'blue', 'green', 'yellow', 'orange', 'purple', 'pink', 'black',
  'white', 'gray', 'brown', 'cyan', 'magenta', 'teal', 'indigo', 'violet',
  'coral', 'salmon', 'gold', 'silver', 'beige', 'ivory', 'khaki', 'lime',
  'navy', 'olive', 'maroon', 'crimson',
];
const NEEDS_REVIEW_SLUGS = new Set([...TW_500_SLUGS, ...TOP_CSS_NAMES]);

for (const s of staging) {
  if (NEEDS_REVIEW_SLUGS.has(s.slug)) s.needsReview = true;
}

/* ------------------------------------------------------------------ */
/*  related[] — siblings by OKLCH proximity within the family          */
/* ------------------------------------------------------------------ */

const FAMILIES = [
  'red', 'orange', 'yellow', 'green', 'teal', 'blue',
  'indigo', 'purple', 'pink', 'brown', 'gray', 'neutral',
];

// Analogous neighbors for cross-family fallback when family is too small.
const ANALOGOUS = {
  red:     ['pink', 'orange'],
  orange:  ['red', 'yellow'],
  yellow:  ['orange', 'green'],
  green:   ['yellow', 'teal'],
  teal:    ['green', 'blue'],
  blue:    ['teal', 'indigo'],
  indigo:  ['blue', 'purple'],
  purple:  ['indigo', 'pink'],
  pink:    ['purple', 'red'],
  brown:   ['orange', 'red'],
  gray:    ['neutral', 'blue'],
  neutral: ['gray', 'blue'],
};

const dE = differenceEuclidean('oklch');

function pickRelated(entry, all) {
  const sameFamily = all.filter((e) => e.family === entry.family && e.slug !== entry.slug);
  const aColor = toOklch(entry.hex);
  function sortByProximity(list) {
    return list
      .map((e) => ({ e, d: dE(aColor, toOklch(e.hex)) }))
      .sort((a, b) => a.d - b.d)
      .map((x) => x.e);
  }
  const sorted = sortByProximity(sameFamily);
  let related = sorted.slice(0, 3).map((e) => e.slug);
  if (related.length < 3) {
    // Pull from analogous families.
    const pool = [];
    for (const fam of ANALOGOUS[entry.family] || []) {
      pool.push(...all.filter((e) => e.family === fam && e.slug !== entry.slug));
    }
    const extras = sortByProximity(pool).map((e) => e.slug);
    for (const slug of extras) {
      if (related.length >= 3) break;
      if (!related.includes(slug)) related.push(slug);
    }
  }
  // Last-ditch fallback: any other entry.
  if (related.length < 3) {
    const fallback = all.filter((e) => e.slug !== entry.slug && !related.includes(e.slug));
    const extras = sortByProximity(fallback).map((e) => e.slug);
    for (const slug of extras) {
      if (related.length >= 3) break;
      related.push(slug);
    }
  }
  return related;
}

for (const s of staging) {
  s.related = pickRelated(s, staging);
}

/* ------------------------------------------------------------------ */
/*  Emit named-colors partial JSON                                     */
/* ------------------------------------------------------------------ */

const namedOut = staging.map((s) => ({
  slug: s.slug,
  name: s.name,
  hex: s.hex,
  family: s.family,
  source: s.source,
  ...(s.aliases && s.aliases.length ? { aliases: s.aliases } : {}),
  ...(s.needsReview ? { needsReview: true } : {}),
  related: s.related,
}));

namedOut.sort((a, b) => a.slug.localeCompare(b.slug));

fs.writeFileSync(
  path.join(__dirname, 'named-colors.partial.json'),
  JSON.stringify(namedOut, null, 2),
);

// Load hand-authored blurbs if present.
const blurbsPath = path.join(__dirname, 'blurbs.json');
const blurbs = fs.existsSync(blurbsPath)
  ? JSON.parse(fs.readFileSync(blurbsPath, 'utf8'))
  : {};

// Also emit a TypeScript scaffold with blurbs filled in from blurbs.json (if
// available). This is the structural deliverable; blurb prose lives in
// blurbs.json so it survives re-runs of this generator.
function tsString(s) {
  // Single-quoted, escape backslash and single quote.
  return "'" + s.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
}

const tsLines = [];
tsLines.push('// AUTO-GENERATED STRUCTURE — blurbs hand-authored. Do not edit by hand');
tsLines.push('// without re-running .tmp-gen/generate.mjs for the structural fields.');
tsLines.push("import type { Hex } from '../color/types';");
tsLines.push('');
tsLines.push("export type ColorFamily =");
tsLines.push("  | 'red' | 'orange' | 'yellow' | 'green' | 'teal' | 'blue'");
tsLines.push("  | 'indigo' | 'purple' | 'pink' | 'brown' | 'gray' | 'neutral';");
tsLines.push('');
tsLines.push('export interface NamedColor {');
tsLines.push('  slug: string;');
tsLines.push('  name: string;');
tsLines.push('  hex: Hex;');
tsLines.push('  family: ColorFamily;');
tsLines.push('  blurb: string;');
tsLines.push("  source: 'css' | 'tailwind' | 'material' | 'bootstrap' | 'curated';");
tsLines.push('  needsReview?: boolean;');
tsLines.push('  aliases?: string[];');
tsLines.push('  related: string[];');
tsLines.push('}');
tsLines.push('');
tsLines.push('export const NAMED_COLORS: NamedColor[] = [');
for (const e of namedOut) {
  tsLines.push('  {');
  tsLines.push(`    slug: ${tsString(e.slug)},`);
  tsLines.push(`    name: ${tsString(e.name)},`);
  tsLines.push(`    hex: ${tsString(e.hex)},`);
  tsLines.push(`    family: ${tsString(e.family)},`);
  tsLines.push(`    source: ${tsString(e.source)},`);
  if (e.aliases && e.aliases.length) {
    tsLines.push(`    aliases: [${e.aliases.map(tsString).join(', ')}],`);
  }
  if (e.needsReview) {
    tsLines.push(`    needsReview: true,`);
  }
  tsLines.push(`    related: [${e.related.map(tsString).join(', ')}],`);
  const blurb = blurbs[e.slug] || '';
  tsLines.push(`    blurb: ${tsString(blurb)},`);
  tsLines.push('  },');
}
tsLines.push('];');
tsLines.push('');
tsLines.push('const BY_HEX = new Map(NAMED_COLORS.map((c) => [c.hex, c]));');
tsLines.push('const BY_SLUG = new Map(NAMED_COLORS.map((c) => [c.slug, c]));');
tsLines.push('');
tsLines.push('export function findByHex(hex: Hex): NamedColor | undefined {');
tsLines.push('  return BY_HEX.get(hex.toLowerCase());');
tsLines.push('}');
tsLines.push('');
tsLines.push('export function findBySlug(slug: string): NamedColor | undefined {');
tsLines.push('  return BY_SLUG.get(slug);');
tsLines.push('}');
tsLines.push('');
tsLines.push('export function byFamily(family: ColorFamily): NamedColor[] {');
tsLines.push('  return NAMED_COLORS.filter((c) => c.family === family);');
tsLines.push('}');
tsLines.push('');

fs.writeFileSync(
  path.join(projectRoot, 'src/lib/data/named-colors.ts'),
  tsLines.join('\n'),
);

console.log(`named-colors: ${namedOut.length} entries (TS scaffold written)`);

// Family counts for sanity.
const famCounts = {};
for (const e of namedOut) famCounts[e.family] = (famCounts[e.family] || 0) + 1;
console.log('family counts:', famCounts);

/* ------------------------------------------------------------------ */
/*  POPULAR_HEXES                                                      */
/* ------------------------------------------------------------------ */

const popular = new Set();

// 1. All Tailwind v4 palette stops (all 26 hues × 11 stops = 286).
for (const t of tailwindAll) popular.add(t.hex);

// 2. Material — at the M2 standard, each hue has 14 tones (50,100,200,...,900 + A100..A700).
// To keep this tractable, expand using OKLCH-based generation around each Material 500.
// We have 10 hues × 13 tones = 130.
for (const m of MATERIAL) {
  const baseHex = m.hex.toLowerCase();
  popular.add(baseHex);
  const base = toOklch(baseHex);
  const tones = [
    { stop: 50,  l: 0.96 },
    { stop: 100, l: 0.93 },
    { stop: 200, l: 0.86 },
    { stop: 300, l: 0.78 },
    { stop: 400, l: 0.70 },
    { stop: 500, l: base.l },
    { stop: 600, l: 0.52 },
    { stop: 700, l: 0.45 },
    { stop: 800, l: 0.38 },
    { stop: 900, l: 0.30 },
    { accent: 'A100', l: 0.92, cMul: 1.1 },
    { accent: 'A200', l: 0.78, cMul: 1.2 },
    { accent: 'A400', l: 0.65, cMul: 1.3 },
  ];
  for (const t of tones) {
    const cMul = t.cMul ?? 1.0;
    const col = clampChroma(
      { mode: 'oklch', l: t.l, c: base.c * cMul, h: base.h ?? 0 },
      'oklch',
      'rgb',
    );
    popular.add(formatHex(col).toLowerCase());
  }
}

// 3. Bootstrap defaults.
for (const b of BOOTSTRAP) popular.add(b.hex.toLowerCase());

// 4. All CSS Named Colors.
for (const c of cssNamedRaw) popular.add(c.hex);

// 4b. Curated named-color hexes (must be present so every NamedColor entry
// has a corresponding /[hex] pre-rendered page).
for (const cu of CURATED) popular.add(cu.hex.toLowerCase());

// 5. Round-number hexes — 6³ web-safe.
const WS_STEPS = [0x00, 0x33, 0x66, 0x99, 0xcc, 0xff];
for (const r of WS_STEPS) {
  for (const g of WS_STEPS) {
    for (const b of WS_STEPS) {
      const hex =
        '#' +
        [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
      popular.add(hex);
    }
  }
}

// 6. Grayscale of the form #XYXYXY for XY ∈ {00, 11, ..., ff}.
for (let i = 0; i < 16; i++) {
  const xy = (i * 0x11).toString(16).padStart(2, '0');
  popular.add(`#${xy}${xy}${xy}`);
}

// 7. Tailwind v3 palette — older but still widely used. Hardcoded for stability.
// Subset: 22 v3 hues × 10 stops (50..900). Hex values per Tailwind v3.4 final.
const TW_V3 = {
  slate:   ['f8fafc','f1f5f9','e2e8f0','cbd5e1','94a3b8','64748b','475569','334155','1e293b','0f172a'],
  gray:    ['f9fafb','f3f4f6','e5e7eb','d1d5db','9ca3af','6b7280','4b5563','374151','1f2937','111827'],
  zinc:    ['fafafa','f4f4f5','e4e4e7','d4d4d8','a1a1aa','71717a','52525b','3f3f46','27272a','18181b'],
  neutral: ['fafafa','f5f5f5','e5e5e5','d4d4d4','a3a3a3','737373','525252','404040','262626','171717'],
  stone:   ['fafaf9','f5f5f4','e7e5e4','d6d3d1','a8a29e','78716c','57534e','44403c','292524','1c1917'],
  red:     ['fef2f2','fee2e2','fecaca','fca5a5','f87171','ef4444','dc2626','b91c1c','991b1b','7f1d1d'],
  orange:  ['fff7ed','ffedd5','fed7aa','fdba74','fb923c','f97316','ea580c','c2410c','9a3412','7c2d12'],
  amber:   ['fffbeb','fef3c7','fde68a','fcd34d','fbbf24','f59e0b','d97706','b45309','92400e','78350f'],
  yellow:  ['fefce8','fef9c3','fef08a','fde047','facc15','eab308','ca8a04','a16207','854d0e','713f12'],
  lime:    ['f7fee7','ecfccb','d9f99d','bef264','a3e635','84cc16','65a30d','4d7c0f','3f6212','365314'],
  green:   ['f0fdf4','dcfce7','bbf7d0','86efac','4ade80','22c55e','16a34a','15803d','166534','14532d'],
  emerald: ['ecfdf5','d1fae5','a7f3d0','6ee7b7','34d399','10b981','059669','047857','065f46','064e3b'],
  teal:    ['f0fdfa','ccfbf1','99f6e4','5eead4','2dd4bf','14b8a6','0d9488','0f766e','115e59','134e4a'],
  cyan:    ['ecfeff','cffafe','a5f3fc','67e8f9','22d3ee','06b6d4','0891b2','0e7490','155e75','164e63'],
  sky:     ['f0f9ff','e0f2fe','bae6fd','7dd3fc','38bdf8','0ea5e9','0284c7','0369a1','075985','0c4a6e'],
  blue:    ['eff6ff','dbeafe','bfdbfe','93c5fd','60a5fa','3b82f6','2563eb','1d4ed8','1e40af','1e3a8a'],
  indigo:  ['eef2ff','e0e7ff','c7d2fe','a5b4fc','818cf8','6366f1','4f46e5','4338ca','3730a3','312e81'],
  violet:  ['f5f3ff','ede9fe','ddd6fe','c4b5fd','a78bfa','8b5cf6','7c3aed','6d28d9','5b21b6','4c1d95'],
  purple:  ['faf5ff','f3e8ff','e9d5ff','d8b4fe','c084fc','a855f7','9333ea','7e22ce','6b21a8','581c87'],
  fuchsia: ['fdf4ff','fae8ff','f5d0fe','f0abfc','e879f9','d946ef','c026d3','a21caf','86198f','701a75'],
  pink:    ['fdf2f8','fce7f3','fbcfe8','f9a8d4','f472b6','ec4899','db2777','be185d','9d174d','831843'],
  rose:    ['fff1f2','ffe4e6','fecdd3','fda4af','fb7185','f43f5e','e11d48','be123c','9f1239','881337'],
};
for (const hue of Object.keys(TW_V3)) {
  for (const h of TW_V3[hue]) popular.add('#' + h);
}

// 8. Synthetic 1000-entry OKLCH-distributed sample of brand-y hexes.
// For each family hue band, sample varied L and C in sRGB-realizable cells.
const FAMILY_HUE_BANDS = {
  red:     [10, 35],
  orange:  [35, 75],
  yellow:  [75, 120],
  green:   [120, 170],
  teal:    [170, 215],
  blue:    [215, 278],
  indigo:  [278, 312],
  purple:  [312, 335],
  pink:    [335, 360],  // also wraps via 0..10 handled in iter
  brown:   [25, 75],
  gray:    [0, 360],
};
const FAMILY_TARGET_COUNT = {
  red: 110, orange: 110, yellow: 110, green: 110, teal: 110, blue: 110,
  indigo: 110, purple: 110, pink: 110, brown: 110, gray: 110,
};
const SAMPLE_LS = [0.18, 0.24, 0.30, 0.36, 0.42, 0.48, 0.54, 0.60, 0.66, 0.72, 0.78, 0.84, 0.90];
const SAMPLE_CS = [0.03, 0.06, 0.09, 0.12, 0.15, 0.18, 0.21, 0.24, 0.27];

let syntheticCount = 0;
function sampleFamily(fam) {
  const want = FAMILY_TARGET_COUNT[fam] || 0;
  let made = 0;
  if (fam === 'gray') {
    // Achromatic ramp at low chroma sweep.
    const Ls = [];
    for (let l = 0.08; l <= 0.97 && Ls.length < 90; l += 0.01) Ls.push(l);
    for (const l of Ls) {
      const col = clampChroma({ mode: 'oklch', l, c: 0.01, h: 250 }, 'oklch', 'rgb');
      const hex = formatHex(col).toLowerCase();
      if (!popular.has(hex)) {
        popular.add(hex);
        made++; syntheticCount++;
        if (made >= want) break;
      }
    }
    return;
  }
  const band = FAMILY_HUE_BANDS[fam];
  if (!band) return;
  // Step through hues across the band (handle wrap for red).
  function* hueIter() {
    if (fam === 'pink') {
      // Pink wraps across 0.
      for (let h = 335; h < 360; h += 1) yield h;
      for (let h = 0; h < 10; h += 1) yield h;
    } else {
      const [lo, hi] = band;
      for (let h = lo; h <= hi; h += 1) yield h;
    }
  }
  outer: for (const h of hueIter()) {
    for (const l of SAMPLE_LS) {
      for (const c of SAMPLE_CS) {
        // For brown specifically, bias toward darker + lower-chroma warm hexes.
        if (fam === 'brown' && (l > 0.55 || c > 0.16)) continue;
        const col = clampChroma({ mode: 'oklch', l, c, h }, 'oklch', 'rgb');
        const hex = formatHex(col).toLowerCase();
        // Filter: must still be realistic (gamut-mapping may have shifted chroma significantly)
        if (popular.has(hex)) continue;
        popular.add(hex);
        made++; syntheticCount++;
        if (made >= want) break outer;
      }
    }
  }
}
for (const fam of Object.keys(FAMILY_TARGET_COUNT)) sampleFamily(fam);

// Validate every hex matches /^#[0-9a-f]{6}$/.
const HEX_RE = /^#[0-9a-f]{6}$/;
const all = Array.from(popular).filter((h) => HEX_RE.test(h));
all.sort();

fs.writeFileSync(
  path.join(__dirname, 'popular-hexes.json'),
  JSON.stringify(all, null, 2),
);

// Emit the TypeScript file.
const popularTs = [];
popularTs.push('// AUTO-GENERATED. Re-run .tmp-gen/generate.mjs to regenerate.');
popularTs.push('//');
popularTs.push('// Deterministic, alphabetically sorted seed list of popular hex colors used');
popularTs.push('// to drive Astro\'s pre-render set. Source breakdown is documented in the');
popularTs.push('// generator script: full Tailwind v4 palette, an OKLCH-expanded Material 3');
popularTs.push('// palette, Bootstrap defaults, all CSS Named Colors, the 6^3 web-safe cube,');
popularTs.push('// the #XYXYXY grayscale, the Tailwind v3 palette (still widely deployed),');
popularTs.push('// and a synthetic ~1000-entry OKLCH-distributed sample to stand in for a');
popularTs.push('// BrandColors-style corpus.');
popularTs.push("import type { Hex } from '../color/types';");
popularTs.push('');
popularTs.push('export const POPULAR_HEXES: readonly Hex[] = [');
const CHUNK = 6;
for (let i = 0; i < all.length; i += CHUNK) {
  const row = all.slice(i, i + CHUNK).map((h) => `'${h}'`).join(', ');
  popularTs.push('  ' + row + ',');
}
popularTs.push('];');
popularTs.push('');

fs.writeFileSync(
  path.join(projectRoot, 'src/lib/data/popular-hexes.ts'),
  popularTs.join('\n'),
);

console.log(`popular-hexes: ${all.length} entries (synthetic added: ${syntheticCount})`);
