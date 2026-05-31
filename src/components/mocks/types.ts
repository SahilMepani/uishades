/**
 * Mock-template registry contract.
 *
 * A "mock" is a self-contained preview template - a Cards layout, a Website
 * hero, a Dashboard, a Buttons sheet - that shows a palette applied to a real
 * UI surface. Every mock is rendered purely by a small set of **scoped CSS
 * custom properties** set on its stage element (see {@link MockVars}); the
 * template markup itself reads only `var(--mock-*)`, never a hex, so a palette
 * recolors live with zero per-color JS and every other swatch on the page can
 * keep using inline `style={{ backgroundColor }}` fills.
 *
 * Adding a mockup later = create one `src/components/mocks/<name>.tsx` module
 * exporting a {@link MockTemplate} and append it to `MOCK_TEMPLATES` in
 * `index.ts`. `MockPreview`, its selector, the PNG export, and the OG render
 * all iterate the registry, so nothing else changes.
 */
import type { CSSProperties, ReactElement } from 'react';

/**
 * The scoped CSS custom properties a stage element carries. Derived from a
 * palette's roles by {@link computeMockVars}; consumed only as `var(--mock-*)`
 * inside template markup. Typed as an index signature of CSS variable names so
 * it drops straight into a React `style` prop.
 */
export interface MockVars {
  '--mock-bg': string;
  '--mock-surface': string;
  '--mock-accent': string;
  '--mock-text': string;
  /** Muted text/hairline derived from `text` over `surface`. */
  '--mock-muted': string;
  /** A faint hairline border tone derived from `text`. */
  '--mock-border': string;
  /** On-accent foreground (auto-picked for contrast against `accent`). */
  '--mock-on-accent': string;
  /** Chip / pill fill (a soft tint of `accent`). */
  '--mock-chip': string;
  /** Up to five chart-series colors (`--mock-chart-0..4`). */
  '--mock-chart-0': string;
  '--mock-chart-1': string;
  '--mock-chart-2': string;
  '--mock-chart-3': string;
  '--mock-chart-4': string;
}

/** A `style`-ready object: the scoped vars plus whatever else the stage sets. */
export type MockVarStyle = MockVars & CSSProperties;

/** One palette color as the mock layer consumes it (hex + optional role). */
export interface MockColorInput {
  hex: string;
  role?: string | null;
}

/**
 * A registered mock template. `Component` renders pure markup styled *only* by
 * the scoped `--mock-*` vars on its ancestor stage - it takes no color props.
 */
export interface MockTemplate {
  /** Stable id, used as the selector value, PNG filename tag, and OG key. */
  id: string;
  /** Short human label shown in the selector. */
  label: string;
  /** Pure-markup renderer. No props: it reads the stage's scoped vars. */
  Component: () => ReactElement;
}
