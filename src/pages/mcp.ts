/**
 * `/mcp` - the UIshades MCP (Model Context Protocol) endpoint.
 *
 * A thin streamable-HTTP / JSON-RPC 2.0 transport wrapper around the pure
 * dispatcher in `lib/mcp/handler`. This file owns only request/response
 * plumbing: parse the JSON body, hand the message to `handleMcpRequest`, and
 * map its return value back onto HTTP. All protocol logic lives in the handler.
 *
 * The endpoint is public and unauthenticated - UIshades is a free, no-auth
 * color tool. Must run on the SSR (non-prerendered) path.
 */
import type { APIRoute } from 'astro';
import { handleMcpRequest } from '../lib/mcp/handler';

export const prerender = false;

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
};

export const POST: APIRoute = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    // Malformed JSON -> JSON-RPC parse error, with a 400 transport status.
    return new Response(
      JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }),
      { status: 400, headers: JSON_HEADERS },
    );
  }

  const response = handleMcpRequest(body as Parameters<typeof handleMcpRequest>[0]);

  // Notifications produce no JSON-RPC response - acknowledge with 202 + no body.
  if (response === null) {
    return new Response(null, { status: 202, headers: JSON_HEADERS });
  }

  return new Response(JSON.stringify(response), { status: 200, headers: JSON_HEADERS });
};

export const GET: APIRoute = () =>
  new Response(
    JSON.stringify({
      error: 'method_not_allowed',
      message: 'POST JSON-RPC to use the MCP server. See /.well-known/mcp/server-card.json',
    }),
    {
      status: 405,
      headers: {
        Allow: 'POST',
        'content-type': 'application/json; charset=utf-8',
      },
    },
  );
