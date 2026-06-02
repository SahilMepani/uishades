<!--
  agent-readiness.md — developer reference for the "agent-readiness" work on UIshades.

  Purpose: document the surfaces that make uishades.com legible and callable by AI
  agents (LLM clients, MCP hosts, autonomous browsers), the one manual DNS step that
  can't live in the repo, and the exact curl commands to verify each surface after a
  Cloudflare Pages deploy.

  Canonical origin for every published URL below: https://uishades.com (lowercase, no
  trailing path). The public API and the MCP endpoint are FREE and require NO auth.
-->

# Agent readiness

UIshades is a free, no-auth color tool. The work documented here makes the same data
that powers the human UI directly consumable by AI agents — without scraping HTML.
Everything is served off the canonical origin `https://uishades.com`.

## What was done

Each surface below is additive and independently verifiable (see [Verification](#verification)).

- **`Link` headers** — `/` and `/[hex]` advertise machine-readable alternates via
  `Link:` response headers: the JSON representation (`rel="alternate"`,
  `type="application/json"` → `/api/{hex}.json`), the markdown representation
  (`rel="alternate"`, `type="text/markdown"`), the API catalog
  (`rel="api-catalog"` → `/.well-known/api-catalog`), and the MCP server
  (`rel="mcp-server"` → `/mcp`). An agent that fetches a page learns where the
  structured data lives from headers alone.
- **Markdown content negotiation on `/` and `/[hex]`** — these routes honor
  `Accept: text/markdown` (and `?format=md`) and return the page rendered through
  `colorPageMarkdown(buildColorPageData(canonical))`
  (`src/lib/markdown/color-page.ts`, `src/lib/color/page-data.ts`). Same data as the
  HTML and the JSON API, in the token-cheap form an LLM prefers. HTML stays the default
  for browsers (`Accept: text/html`).
- **`/.well-known/api-catalog`** — RFC 9727 linkset (`public/.well-known/api-catalog`)
  that points agents at the OpenAPI description (`/openapi.json`), the human/LLM service
  doc (`/llms.txt`), the MCP server-card (`/.well-known/mcp/server-card.json`), and
  representative `item` endpoints (the color JSON API and the `/mcp` endpoint).
- **Agent-skills index** — a discovery manifest describing the callable "skills" the
  site exposes (generate shades from a color), so skill-aware agent runtimes can wire up
  the tool without bespoke integration code.
- **MCP server at `/mcp` + server-card** — a JSON-RPC 2.0 endpoint over the
  streamable-http transport. It exposes one tool, **`generate_shades`**, taking
  `{ color: string }` (hex, `rgb()`/`hsl()`/`oklch()`, or a CSS color name; parsed via
  `parseColor` in `src/lib/color/parse.ts`) and returning the `ColorPageData` rendered
  as markdown **text** plus `structuredContent` (the raw `ColorPageData`). The
  server-card at `/.well-known/mcp/server-card.json` is the static descriptor agents
  read to discover the endpoint, transport, and tool list.
- **`auth.md`** — an explicit statement that the public API and the MCP endpoint require
  **no authentication**. Agents that look for an auth contract find a definitive "none
  needed" answer instead of guessing.
- **`llms-full.txt`** — the long-form companion to `llms.txt`: a single document
  describing the site, the data model (`ColorPageData` / `Shade`), the JSON API, the MCP
  tool, and example calls, sized for an LLM to ingest in one fetch.
- **Content-Signal in `robots.txt`** — `public/robots.txt` carries Content-Signal
  directives declaring how our content may be used (search/AI-input vs. training),
  complementing the existing per-bot allow/throttle/block groups.
- **WebMCP in the React island** — `src/components/ShadeTool.tsx` registers the
  `generate_shades` tool in-page (WebMCP), so an agent driving a real browser session
  can call the tool against the live DOM state rather than reconstructing it from
  scratch.

All published URLs use the lowercase canonical origin `https://uishades.com`.

## DNS-AID (manual step)

DNS-based AI Discovery (DNS-AID) advertises the MCP endpoint at the DNS layer so an
agent that only knows the domain `uishades.com` can find `/mcp` before fetching a single
page. **This cannot be done from the repo** — it requires DNS records in the Cloudflare
DNS dashboard for `uishades.com`.

DNS-AID (per IETF `draft-mozleywilliams-dnsop-dnsaid`) prefers **SVCB/HTTPS records
under the `_agents` leaf zone**, with **DANE/TLSA** records for origin authentication.
Where SVCB tooling isn't available, a **TXT record is the simplest deployable fallback**
and is what we ship first.

### TXT fallback record (deploy this)

Add a single TXT record:

| Field   | Value                                                                             |
| ------- | --------------------------------------------------------------------------------- |
| Type    | `TXT`                                                                             |
| Name    | `_mcp._agents` (Cloudflare appends the zone → `_mcp._agents.uishades.com`)         |
| Content | `v=dnsaid1; type=mcp; url=https://uishades.com/mcp; transport=streamable-http`     |
| TTL     | Auto                                                                              |

So the published record is:

```
_mcp._agents.uishades.com.  IN  TXT  "v=dnsaid1; type=mcp; url=https://uishades.com/mcp; transport=streamable-http"
```

### Steps (Cloudflare dashboard)

1. Cloudflare dashboard → select the **uishades.com** zone.
2. **DNS → Records → Add record**.
3. Type **TXT**, Name `_mcp._agents`, Content
   `v=dnsaid1; type=mcp; url=https://uishades.com/mcp; transport=streamable-http`,
   TTL **Auto**.
4. Save.

### Preferred form (where supported)

The SVCB/HTTPS + DANE/TLSA form under `_agents` is preferred over the TXT fallback: SVCB
gives agents typed service parameters and TLSA pins the origin certificate for
authenticated discovery. Add those records once Cloudflare/tooling support is in place;
keep the TXT record as the broadly-compatible fallback.

## Verification

Run these after a deploy reaches Cloudflare Pages. Each confirms one surface.

**1. `Link` header (home and a hex page):**

```sh
curl -sI https://uishades.com/ | grep -i '^link'
curl -sI https://uishades.com/4040ff | grep -i '^link'
```

Expect alternates for the JSON API, markdown representation, `api-catalog`, and
`mcp-server`.

**2. Markdown content negotiation:**

```sh
curl -s -H 'Accept: text/markdown' https://uishades.com/ | head
curl -s -H 'Accept: text/markdown' https://uishades.com/4040ff | head
```

Expect markdown (the rendered `ColorPageData`), not HTML.

**3. API catalog:**

```sh
curl -s https://uishades.com/.well-known/api-catalog | jq .
```

Expect the RFC 9727 linkset with `service-desc` (OpenAPI), `service-doc` (`llms.txt`),
`service-meta` (MCP server-card), and the `item` endpoints.

**4. Agent-skills index:**

```sh
curl -s https://uishades.com/.well-known/agent-skills.json | jq .
```

Expect the skills manifest listing the `generate_shades` skill.

**5. MCP server-card:**

```sh
curl -s https://uishades.com/.well-known/mcp/server-card.json | jq .
```

Expect the descriptor with the `/mcp` URL, `streamable-http` transport, and the
`generate_shades` tool.

**6. MCP `tools/list` and `tools/call` (JSON-RPC 2.0 over POST):**

```sh
# List the tools the server exposes.
curl -s https://uishades.com/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

# Call generate_shades with a color.
curl -s https://uishades.com/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"generate_shades","arguments":{"color":"#4040ff"}}}'
```

`tools/list` should include `generate_shades`. `tools/call` should return the
`ColorPageData` as markdown `content` plus `structuredContent`.

**7. Re-run the external scan:**

After all of the above pass, re-run the agent-readiness scan at
**https://isitagentready.com/** for `https://uishades.com`.
