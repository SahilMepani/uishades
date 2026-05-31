/**
 * Tailwind v3 config snippet export.
 *
 * Produces the full `module.exports = { ... }` snippet for a
 * tailwind.config.js - designers can paste it straight in (or copy just
 * the inner `extend.colors.{slug}` block). The 50..950 keys are emitted
 * as quoted strings so they're valid JS object literals.
 */

import type { TailwindScale } from '../color/types';

function sanitizeName(name: string): string {
  const cleaned = (name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned || 'brand';
}

export function toTailwindV3(scale: TailwindScale, name: string): string {
  const slug = sanitizeName(name);
  const entries = scale.shades
    .map((s) => `          '${s.stop}': '${s.hex}',`)
    .join('\n');
  return [
    `module.exports = {`,
    `  theme: {`,
    `    extend: {`,
    `      colors: {`,
    // Quote the group key: `slug` may be hyphenated (sanitizeName keeps `-`),
    // and a bare hyphenated identifier (`burnt-orange:`) is a SyntaxError when
    // the pasted config is require()'d. The 50…950 stop keys below are quoted
    // for the same reason.
    `        '${slug}': {`,
    entries,
    `        },`,
    `      },`,
    `    },`,
    `  },`,
    `};`,
    '',
  ].join('\n');
}
