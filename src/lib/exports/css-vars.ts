/**
 * Plain CSS custom properties export.
 *
 * Same shape as the Tailwind v4 export but without the `@theme` wrapper and
 * without the `color-` prefix (that prefix is Tailwind-v4-specific). Variable
 * names follow `--{name}-{key}`.
 */

import { sanitizeName, tokenValue, type ColorToken, type ValueMode } from './tokens';

export function toCssVars(
  tokens: ColorToken[],
  name: string,
  valueMode: ValueMode,
): string {
  const slug = sanitizeName(name);
  const lines = tokens.map((t) => `  --${slug}-${t.key}: ${tokenValue(t, valueMode)};`);
  return `:root {\n${lines.join('\n')}\n}\n`;
}
