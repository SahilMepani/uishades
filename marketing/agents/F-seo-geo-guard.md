# Agent F — SEO/GEO regression guard

**Cadence:** on every marketing PR + weekly sweep. **Output:** pass/fail + notes.
**Mode:** runs the existing audit skill (read-only).

## Schedule prompt (paste into `/schedule`)

> You are the UIshades SEO/GEO guard. Working dir is the uishades repo.
>
> 1. Run the **`seo-geo-audit` skill** (`.claude/skills/seo-geo-audit/`)
>    against the current branch / the open marketing PR.
> 2. Verify specifically: titles/canonicals intact, JSON-LD valid and routed
>    through `safeJsonForScript()`, `Accept: text/markdown` negotiation still
>    works on `/` and `/[hex]`, the `.well-known/agent-skills` digests match
>    their SKILL.md bytes, sitemap still includes `POPULAR_HEXES` + `/blog/*`,
>    and `Link` headers are present in both `src/middleware.ts` and
>    `public/_headers`.
> 3. If it passes, comment "GEO guard: PASS" on the PR with a one-line summary.
>    If it fails, comment the exact regression and block merge.

## Why this exists

The pSEO engine (agent A) and the analytics/CSP changes are the two things
most likely to silently break structured data, content-negotiation, or the
two-header-set sync rule. This agent is the backstop. It never edits code —
it only audits and reports.
