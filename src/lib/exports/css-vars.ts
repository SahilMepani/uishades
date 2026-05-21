/**
 * Plain CSS custom properties export.
 *
 * Same shape as the Tailwind v4 export but without the `@theme` directive
 * wrapper — usable in any project regardless of framework. Variable names
 * follow `--{name}-{stop}` (no `color-` prefix; that prefix is a
 * Tailwind-v4-specific convention).
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

export function toCssVars(scale: TailwindScale, name: string): string {
  const slug = sanitizeName(name);
  const lines = scale.shades.map((s) => `  --${slug}-${s.stop}: ${s.hex};`);
  return `:root {\n${lines.join('\n')}\n}\n`;
}
