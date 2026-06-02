# Authentication

UIshades is a free, ad-free, public color tool. Its machine interfaces need no credentials.

## Public API and MCP — no auth

- The JSON API (`https://uishades.com/api/*.json`) requires **no authentication**. It is free to call.
- The MCP endpoint (`https://uishades.com/mcp`, streamable HTTP) requires **no authentication**. The `generate_shades` tool is free to call.

There are no API keys, tokens, or rate-limit registration steps for agents.

## Human accounts (not required for agents)

Saving palettes is an optional, human-facing feature. It uses cookie-session login via Google, GitHub, or magic-link email. This login is for people, not agents: there is **no agent OAuth flow**, and none of the read-only API or MCP capabilities depend on it.
