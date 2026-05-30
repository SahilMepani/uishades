import { useMemo, useState } from 'react';
import { MOCK_TEMPLATES, getMockTemplate } from './mocks';
import { computeMockVars } from './mocks/vars';
import type { MockColorInput, MockVarStyle } from './mocks/types';

/**
 * MockPreview — shows the working palette applied to a real UI surface.
 *
 * A "stage" div carries the scoped `--mock-*` CSS custom properties derived from
 * the palette's roles (via the pure {@link computeMockVars}); the selected mock
 * template renders inside it and recolours live with zero per-color JS. The
 * selector is a segmented control while the registry is short and auto-switches
 * to a compact dropdown once it grows past five — preserving the anti-overwhelm
 * cap. A "Download mockup PNG" button dynamically imports the canvas renderer
 * (so it stays out of the eager bundle, mirroring `ramp-png.ts`).
 *
 * Pure-presentational: it takes the palette colours and owns only the selected-
 * template + downloading UI state. The SSR `/p/[slug]` hero and the OG image
 * reuse `computeMockVars` + the registry's `HERO_MOCK` server-side rather than
 * mounting this island.
 */

/** Selector flips from segmented to dropdown beyond this many templates. */
const SEGMENTED_MAX = 5;

export interface MockPreviewProps {
  /** Working palette: ordered colours with optional roles. */
  colors: MockColorInput[];
  /** Name/slug used for the downloaded PNG filename. */
  name?: string;
  /** Initial template id (defaults to the first registered = Cards). */
  initialTemplateId?: string;
}

export default function MockPreview({ colors, name = 'palette', initialTemplateId }: MockPreviewProps) {
  const [selectedId, setSelectedId] = useState<string>(initialTemplateId ?? MOCK_TEMPLATES[0].id);
  const [downloading, setDownloading] = useState(false);

  const template = getMockTemplate(selectedId);
  const Stage = template.Component;

  const stageStyle = useMemo<MockVarStyle>(
    () => ({ ...computeMockVars(colors) }),
    [colors],
  );

  const segmented = MOCK_TEMPLATES.length <= SEGMENTED_MAX;
  const canDownload = colors.length > 0;

  async function handleDownload() {
    if (!canDownload || downloading) return;
    setDownloading(true);
    try {
      const { downloadMockPng } = await import('../lib/exports/mock-png');
      await downloadMockPng({ colors, templateId: template.id, name });
    } catch {
      /* swallow — a failed canvas export is non-fatal */
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Header: label + selector + download */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="eyebrow">Preview</span>
        <div className="flex items-center gap-3">
          {segmented ? (
            <div
              role="tablist"
              aria-label="Mockup template"
              className="relative inline-flex rounded-full bg-paper-2 p-1 ring-1 ring-ink/10"
            >
              {MOCK_TEMPLATES.map((t) => {
                const active = t.id === selectedId;
                return (
                  <button
                    key={t.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setSelectedId(t.id)}
                    className={[
                      'rounded-full px-3 py-1.5 font-mono text-xs font-medium uppercase tracking-tight',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60',
                      active ? 'bg-ink text-paper shadow-sm' : 'text-ink/70 hover:text-ink',
                    ].join(' ')}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
          ) : (
            <label className="flex items-center gap-2">
              <span className="sr-only">Mockup template</span>
              <div className="relative">
                <select
                  value={selectedId}
                  onChange={(e) => setSelectedId(e.target.value)}
                  className={
                    'appearance-none border border-ink/20 bg-paper-2 py-1.5 pl-3 pr-8 ' +
                    'font-mono text-xs text-ink focus-visible:outline-none focus-visible:border-accent ' +
                    'focus-visible:ring-2 focus-visible:ring-accent/30'
                  }
                >
                  {MOCK_TEMPLATES.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-mute"
                >
                  ▾
                </span>
              </div>
            </label>
          )}

          <button
            type="button"
            onClick={handleDownload}
            disabled={!canDownload || downloading}
            className={
              'inline-flex items-center gap-1.5 border border-ink/20 bg-paper px-3 py-1.5 ' +
              'font-mono text-xs text-ink transition-colors duration-150 ease-out ' +
              'hover:bg-paper-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ' +
              'disabled:opacity-50 motion-reduce:transition-none'
            }
          >
            {downloading ? 'Rendering…' : 'Download mockup PNG'}
          </button>
        </div>
      </div>

      {/* Stage: scoped vars live here; the template reads only var(--mock-*). */}
      <div
        style={stageStyle}
        className="aspect-[16/10] w-full overflow-hidden rounded-lg border border-hairline"
      >
        <Stage />
      </div>
    </div>
  );
}
