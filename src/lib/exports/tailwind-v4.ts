/**
 * Tailwind v4 `@theme` block export.
 *
 * Produces a single `@theme` directive of `--color-{name}-{key}` custom
 * properties. `key` is the Tailwind stop (50..950) or the OKLCH ramp index
 * (1..20). One color family is one group; a multi-color palette emits every
 * group's vars inside the same block, separated by a blank line.
 */

import { sanitizeName, tokenValue, type ColorGroup, type ValueMode } from './tokens';

export function toTailwindV4(groups: ColorGroup[], valueMode: ValueMode): string {
  const blocks = groups.map((g) => {
    const slug = sanitizeName(g.name);
    return g.tokens
      .map((t) => `  --color-${slug}-${t.key}: ${tokenValue(t, valueMode)};`)
      .join('\n');
  });
  return `@theme {\n${blocks.join('\n\n')}\n}\n`;
}
