/**
 * Mock-template registry.
 *
 * The single source of truth for which preview mockups exist. `MockPreview`,
 * its selector, the PNG export, and the SSR `/p/[slug]` hero + OG image all
 * iterate this array - **adding a mockup is one new module + one line here.**
 *
 * Order matters: the first entry (`cards`) is the default selection and the one
 * reused server-side as the palette hero and OG base. Keep Cards first.
 */
import { cardsMock } from './cards';
import { websiteMock } from './website';
import { dashboardMock } from './dashboard';
import { buttonsMock } from './buttons';
import type { MockTemplate } from './types';

export const MOCK_TEMPLATES: readonly MockTemplate[] = [
  cardsMock,
  websiteMock,
  dashboardMock,
  buttonsMock,
];

/** The default/hero template (Cards) - server-rendered on `/p/[slug]` + OG. */
export const HERO_MOCK: MockTemplate = cardsMock;

/** Look up a template by id; falls back to the hero (Cards) when unknown. */
export function getMockTemplate(id: string | null | undefined): MockTemplate {
  return MOCK_TEMPLATES.find((t) => t.id === id) ?? HERO_MOCK;
}

export type { MockTemplate, MockVars, MockColorInput, MockVarStyle } from './types';
export { computeMockVars, resolveRoles } from './vars';
