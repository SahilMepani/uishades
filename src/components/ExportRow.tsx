import { lazy, Suspense } from 'react';
import type { ExportDropdownProps } from './ExportDropdown';

/**
 * Shared lazy boundary for the export-controls row.
 *
 * The export-dropdown UI plus its five export-format serializers are the
 * heaviest leaf of the React island, so it loads after hydration behind this
 * boundary. Three call sites use it - the shade-grid row atop `TailwindScale`
 * and `ContinuousRamp`, and the sidebar row in `ShadeTool` - so they all
 * resolve the same chunk and present one identical, height-stable fallback
 * while it streams in. Keeping the boundary here (not around a whole view)
 * means the SSR'd HTML still carries the real shade content as crawlable
 * markup, not a skeleton.
 */
const ExportDropdown = lazy(() => import('./ExportDropdown'));

export default function ExportRow(props: ExportDropdownProps) {
  return (
    <Suspense fallback={<ExportRowFallback />}>
      <ExportDropdown {...props} />
    </Suspense>
  );
}

/**
 * Height-stable placeholder for the lazy `ExportDropdown` chunk. Reserves
 * roughly the height of the real "Export as" controls row (a label + select
 * and two icon buttons, with the "Copy as" picker at the far right) so the
 * content below it doesn't jump when the chunk arrives.
 */
function ExportRowFallback() {
  return (
    <div aria-hidden="true" className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <div className="h-7 w-40 bg-paper-2 motion-safe:animate-pulse" />
        <div className="h-7 w-7 bg-paper-2 motion-safe:animate-pulse" />
        <div className="h-7 w-7 bg-paper-2 motion-safe:animate-pulse" />
      </div>
      <div className="h-7 w-24 bg-paper-2 motion-safe:animate-pulse" />
    </div>
  );
}
