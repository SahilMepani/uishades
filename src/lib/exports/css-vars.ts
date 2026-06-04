/**
 * Plain CSS custom properties export.
 *
 * Same shape as the Tailwind v4 export but without the `@theme` wrapper and
 * without the `color-` prefix (that prefix is Tailwind-v4-specific). Variable
 * names follow `--{name}-{key}`. A multi-color palette emits every group's
 * vars inside the same `:root` block, separated by a blank line.
 */

import { sanitizeName, tokenValue, type ColorGroup, type ValueMode } from './tokens';

export function toCssVars(groups: ColorGroup[], valueMode: ValueMode): string {
  const blocks = groups.map((g) => {
    const slug = sanitizeName(g.name);
    return g.tokens
      .map((t) => `  --${slug}-${t.key}: ${tokenValue(t, valueMode)};`)
      .join('\n');
  });
  return `:root {\n${blocks.join('\n\n')}\n}\n`;
}
