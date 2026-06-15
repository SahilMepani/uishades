/**
 * Tailwind v4 `@theme` block export.
 *
 * Produces a single `@theme` directive of `--color-{name}-{key}` custom
 * properties. `key` is the Tailwind stop (50..950) - the OKLCH ramp keys to the
 * same 50..950 stops. One color family is one group; a multi-color palette emits every
 * group's vars inside the same block, separated by a blank line.
 *
 * **Two-tier:** when any group carries a `semantic` label the block grows a
 * second tier of `--color-{role}*: var(--color-{primitive}-{stop})` aliases
 * (Tailwind generates `bg-primary`, `bg-primary-hover`, …) under a `/* semantic *\/`
 * header, with the primitives under `/* primitives *\/`. With no semantic labels
 * the output is byte-for-byte the original single-tier block.
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
    .map((t) => `  --color-${slug}-${t.key}: ${tokenValue(t, valueMode)};`)
    .join('\n');
}

function semanticBlock(g: ColorGroup): string {
  const role = sanitizeName(g.semantic ?? '');
  const slug = sanitizeName(g.name);
  return semanticTokens(g)
    .map(
      (s) =>
        `  --color-${semanticVarName(role, s.variant)}: var(--color-${slug}-${s.ref.stop});`,
    )
    .join('\n');
}

export function toTailwindV4(groups: ColorGroup[], valueMode: ValueMode): string {
  const primitives = groups.map((g) => primitiveBlock(g, valueMode));
  const semantics = groups
    .map((g) => semanticBlock(g))
    .filter((b) => b.length > 0);
  if (semantics.length === 0) {
    return `@theme {\n${primitives.join('\n\n')}\n}\n`;
  }
  return (
    `@theme {\n  /* primitives */\n${primitives.join('\n\n')}\n\n` +
    `  /* semantic */\n${semantics.join('\n\n')}\n}\n`
  );
}
