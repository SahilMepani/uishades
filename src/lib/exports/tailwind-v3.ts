/**
 * Tailwind v3 config snippet export.
 *
 * Produces the full `module.exports = { ... }` snippet. The brand keys and the
 * per-shade keys are quoted strings so a hyphenated slug (e.g. burnt-orange)
 * or a bare numeric key stays a valid JS object literal when the pasted config
 * is require()'d. A multi-color palette emits one quoted color key per group.
 */

import { sanitizeName, tokenValue, type ColorGroup, type ValueMode } from './tokens';

export function toTailwindV3(groups: ColorGroup[], valueMode: ValueMode): string {
  const colorBlocks = groups
    .map((g) => {
      const slug = sanitizeName(g.name);
      const entries = g.tokens
        .map((t) => `          '${t.key}': '${tokenValue(t, valueMode)}',`)
        .join('\n');
      return [`        '${slug}': {`, entries, `        },`].join('\n');
    })
    .join('\n');
  return [
    `module.exports = {`,
    `  theme: {`,
    `    extend: {`,
    `      colors: {`,
    colorBlocks,
    `      },`,
    `    },`,
    `  },`,
    `};`,
    '',
  ].join('\n');
}
