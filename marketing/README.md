# UIshades marketing workspace

The substrate for **autonomous, human-approved** marketing. Six scheduled
Claude Code cloud agents (see `agents/`) read the backlogs here, produce
queued artifacts, and **never post to community sites themselves** — you
approve and post. See `docs/audience-roadmap.md` for the strategy this serves
(free forever, Tailwind/React devs first, success = return developers +
agent/citation traffic).

## Layout

| Path | What it is | Who writes it |
|---|---|---|
| `keywords.md` | Prioritized pSEO cluster backlog | You seed; agent E re-prioritizes; agent A consumes |
| `topics.md` | Blog/article backlog | You seed; agent E adds; agent B consumes |
| `playbook.md` | Voice + value-first posting rules every agent must follow | You (rarely changes) |
| `agents/*.md` | The prompt spec for each scheduled cloud agent | You (paste into `/schedule`) |
| `drafts/` | Blog/article drafts awaiting your edit | agent B |
| `queue/` | Community posts + reply opportunities awaiting your manual post | agent C |
| `reports/` | Citation logs + weekly growth reports | agents D, E |

## The loop

```
agent E (weekly report) ──picks next cluster/topic──▶ keywords.md / topics.md
        ▲                                                     │
        │                                            agent A (pSEO PR)
   measures ◀── agent D (citation monitor) ◀── agent C (community) ◀── agent B (blog)
```

Every change agent A makes runs through the `seo-geo-audit` skill (agent F)
before it's mergeable, so growth work can't silently break structured data.

## Hard rules (encoded in every agent prompt)

1. **No agent auto-posts to Reddit / HN / Product Hunt / X.** Drafts only.
   Automated posting gets accounts banned. You are the publish step.
2. **No monetization framing, ever.** Free forever is the position.
3. **Respect the data split** (`CLAUDE.md`): the SEO engine edits
   `named-colors.ts` / `popular-hexes.ts` (build-time) and must never pull
   blurbs into the island's `named-colors-slim.ts`.
4. **Every SEO PR must pass the `seo-geo-audit` skill** before merge.

## Wiring the agents (one-time)

Each file in `agents/` is a ready-to-paste prompt for the `/schedule` skill.
Create one cloud routine per agent with the cadence noted at the top of its
file. Agents that need live data (D, E) require the env/credentials listed in
their spec (Cloudflare Analytics API token, GSC). Until those are connected,
D and E run in degraded mode (search-only) and say so in their output.
