# OKLCH Index Export — Execution Progress

**Method:** subagent-driven-development (fresh implementer per task + spec review + code-quality review).
**Branch:** `feat/oklch-index-export` (do NOT switch). Stay on this branch.
**Plan:** `docs/superpowers/plans/2026-06-01-oklch-index-export.md` (full task text/code there).
**Spec:** `docs/superpowers/specs/2026-06-01-oklch-index-export-design.md`

## Commits so far
- `8c587ec` docs: spec
- `f695e08` (user's pre-existing WIP — toast/ShadeTool/etc., already committed by user)
- `7e4eb98` docs: plan
- `f500c6c` Task 1: shared token module (tokens.ts + tests) — DONE, spec ✅, quality ✅ Approved

## Status (10 tasks total)
- [x] Task 1: tokens.ts — COMPLETE (commit f500c6c)
- [ ] Task 2: refactor CSS-family serializers (tailwind-v4, tailwind-v3, css-vars) → `(tokens, name, valueMode)`, follow toggle, delete local sanitizeName, import from tokens.ts
- [ ] Task 3: refactor JSON serializers (w3c-tokens, figma-vars) → `(tokens, name, _valueMode)`, ALWAYS hex
- [ ] Task 4: fix tests/exports.spec.ts callsite to new toTailwindV3(tokens,'name','hex') signature
- [ ] Task 5: generalize ExportDropdown.tsx (props: tokens, valueMode, onValueModeChange, showValueToggle; render hex/oklch toggle; update ExportModal)
- [ ] Task 6: TailwindScale.tsx → pass scaleToTokens(scale), valueMode="hex", showValueToggle={false}, onValueModeChange={()=>{}}
- [ ] Task 7: ContinuousRamp.tsx → mount lazy ExportDropdown with rampToTokens(ramp), toggle on; add props
- [ ] Task 8: ShadeTool.tsx → STORAGE_KEYS.oklchValueMode='shades.oklchValueMode'; usePersistedState default 'oklch', urlParam null; thread props into ContinuousRamp (shares exportFormat/setExportFormat)
- [ ] Task 9: npm run build; add e2e test to tests/e2e/tool.spec.ts (OKLCH view export + hex/oklch toggle)
- [ ] Task 10: final verify (npm test, npm run test:e2e, npm run build)

## Per-task process
1. Dispatch general-purpose implementer with FULL task text from plan + scene-setting context. Tell it: stay on branch, TDD, single commit per task as specified, don't touch other files, report Status + SHA.
2. Dispatch spec reviewer (verify independently, read code, run tests, check no scope creep).
3. If ✅, dispatch code-quality reviewer (git diff BASE..HEAD).
4. Fix loop if issues. Mark TaskUpdate complete. Next task.

## Key invariants / gotchas
- Tailwind output must stay BYTE-IDENTICAL (valueMode="hex", same '50'..'950' keys). exports.spec.ts (Task 4) guards this.
- sanitizeName now lives ONLY in tokens.ts after Tasks 2-3. Delete the 5 dupes.
- w3c-tokens + figma-vars IGNORE valueMode (always hex) — rule documented in-file.
- oklchValueMode: localStorage-only, NO url param (urlParam=null), default 'oklch'.
- Both TailwindScale & ContinuousRamp do `lazy(()=>import('./ExportDropdown'))` — bundler dedupes to one chunk.
- ramp indices plain 1..20 (not zero-padded), lightest=1.
- TaskUpdate uses sequential IDs 1..10 (NOT uuids). Task 1 = id "1", etc.
- webkit e2e export tests are test.fixme (lazy-panel click flakiness) — matches existing pattern.
- Pre-existing WIP already committed in f695e08, working tree clean except untracked .claude/ dir (leave alone).
