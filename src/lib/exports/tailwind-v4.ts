/**
 * Tailwind v4 `@theme` block export.
 *
 * Produces a `@theme` directive containing CSS custom properties named
 * `--color-{name}-{stop}` — Tailwind v4's expected convention for palette
 * registration.
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

export function toTailwindV4(scale: TailwindScale, name: string): string {
  const slug = sanitizeName(name);
  const lines = scale.shades.map((s) => `  --color-${slug}-${s.stop}: ${s.hex};`);
  return `@theme {\n${lines.join('\n')}\n}\n`;
}
