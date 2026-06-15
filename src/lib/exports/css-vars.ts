/**
 * Plain CSS custom properties export.
 *
 * Same shape as the Tailwind v4 export but without the `@theme` wrapper and
 * without the `color-` prefix (that prefix is Tailwind-v4-specific). Variable
 * names follow `--{name}-{key}`. A multi-color palette emits every group's
 * vars inside the same `:root` block, separated by a blank line.
 *
 * **Two-tier:** when any group carries a `semantic` label the `:root` block
 * grows a second tier of `--{role}*: var(--{primitive}-{stop})` aliases under a
 * `/* semantic *\/` header. With no semantic labels the output is byte-for-byte
 * the original single-tier block.
 */

import {
  sanitizeName,
  tokenValue,
  semanticTokens,
  semanticVarName,
  type ColorGroup,
  type ValueMode,
} from './tokens';

function primitiveBlock(g: ColorGroup, valueMode: ValueMode): string {
  const slug = sanitizeName(g.name);
  return g.tokens
    .map((t) => `  --${slug}-${t.key}: ${tokenValue(t, valueMode)};`)
    .join('\n');
}

function semanticBlock(g: ColorGroup): string {
  const role = sanitizeName(g.semantic ?? '');
  const slug = sanitizeName(g.name);
  return semanticTokens(g)
    .map(
      (s) => `  --${semanticVarName(role, s.variant)}: var(--${slug}-${s.ref.stop});`,
    )
    .join('\n');
}

export function toCssVars(groups: ColorGroup[], valueMode: ValueMode): string {
  const primitives = groups.map((g) => primitiveBlock(g, valueMode));
  const semantics = groups
    .map((g) => semanticBlock(g))
    .filter((b) => b.length > 0);
  if (semantics.length === 0) {
    return `:root {\n${primitives.join('\n\n')}\n}\n`;
  }
  return (
    `:root {\n  /* primitives */\n${primitives.join('\n\n')}\n\n` +
    `  /* semantic */\n${semantics.join('\n\n')}\n}\n`
  );
}
