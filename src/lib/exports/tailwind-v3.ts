/**
 * Tailwind v3 config snippet export.
 *
 * Produces the full `module.exports = { ... }` snippet. The brand key and the
 * per-shade keys are quoted strings so a hyphenated slug (e.g. burnt-orange)
 * or a bare numeric key stays a valid JS object literal when the pasted config
 * is require()'d.
 */

import { sanitizeName, tokenValue, type ColorToken, type ValueMode } from './tokens';

export function toTailwindV3(
  tokens: ColorToken[],
  name: string,
  valueMode: ValueMode,
): string {
  const slug = sanitizeName(name);
  const entries = tokens
    .map((t) => `          '${t.key}': '${tokenValue(t, valueMode)}',`)
    .join('\n');
  return [
    `module.exports = {`,
    `  theme: {`,
    `    extend: {`,
    `      colors: {`,
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
