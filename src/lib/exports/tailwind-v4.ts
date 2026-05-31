/**
 * Tailwind v4 `@theme` block export.
 *
 * Produces a `@theme` directive of `--color-{name}-{key}` custom properties.
 * `key` is the Tailwind stop (50..950) or the OKLCH ramp index (1..20),
 * supplied by the caller as a normalized ColorToken[].
 */

import { sanitizeName, tokenValue, type ColorToken, type ValueMode } from './tokens';

export function toTailwindV4(
  tokens: ColorToken[],
  name: string,
  valueMode: ValueMode,
): string {
  const slug = sanitizeName(name);
  const lines = tokens.map(
    (t) => `  --color-${slug}-${t.key}: ${tokenValue(t, valueMode)};`,
  );
  return `@theme {\n${lines.join('\n')}\n}\n`;
}
