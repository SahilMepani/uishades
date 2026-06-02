/**
 * Pure, framework-free MCP (Model Context Protocol) JSON-RPC 2.0 dispatcher.
 *
 * This module owns *all* MCP protocol logic for UIshades' `/mcp` endpoint and
 * deliberately knows nothing about Astro, Workers, HTTP, or transports - it
 * takes a parsed JSON-RPC message in and returns a JSON-RPC response object
 * (or `null` for notifications). That keeps it trivially unit-testable and lets
 * the thin `src/pages/mcp.ts` endpoint handle only request/response plumbing.
 *
 * The single tool exposed is `generate_shades`, which routes any color string
 * through the same `parseColor` -> `buildColorPageData` -> `colorPageMarkdown`
 * pipeline the public JSON API and the markdown content-negotiation surface use,
 * so an MCP client sees byte-for-byte the same ramp/scale/neighbor data.
 */
import { buildColorPageData } from '../color/page-data';
import { parseColor, ParseError } from '../color/parse';
import { colorPageMarkdown } from '../markdown/color-page';

/** Negotiated MCP protocol revision advertised on `initialize`. */
export const MCP_PROTOCOL_VERSION = '2025-06-18';

/** Server identity returned on `initialize`. */
export const MCP_SERVER_INFO = { name: 'UIshades', version: '1.0.0' } as const;

/** The lone tool: turn any color into an OKLCH ramp + Tailwind scale. */
export const GENERATE_SHADES_TOOL = {
  name: 'generate_shades',
  description:
    'Generate a 20-step OKLCH perceptual tints-and-shades ramp plus an 11-stop Tailwind scale (50–950) for any color. Accepts a hex (#4040ff or 4040ff), rgb()/hsl()/oklch(), or a CSS color name.',
  inputSchema: {
    type: 'object',
    properties: {
      color: {
        type: 'string',
        description: 'A color: hex, rgb(), hsl(), oklch(), or CSS color name.',
      },
    },
    required: ['color'],
    additionalProperties: false,
  },
} as const;

/** Tool catalogue returned by `tools/list`. */
export const MCP_TOOLS = [GENERATE_SHADES_TOOL];

/** A loosely-typed inbound JSON-RPC 2.0 request/notification. */
export interface JsonRpcMessage {
  jsonrpc?: string;
  id?: string | number | null;
  method?: unknown;
  params?: Record<string, unknown> | undefined;
}

/** A JSON-RPC 2.0 success response. */
export interface JsonRpcSuccess {
  jsonrpc: '2.0';
  id: string | number | null;
  result: unknown;
}

/** A JSON-RPC 2.0 error response. */
export interface JsonRpcError {
  jsonrpc: '2.0';
  id: string | number | null;
  error: { code: number; message: string };
}

export type JsonRpcResponse = JsonRpcSuccess | JsonRpcError;

/** JSON-RPC 2.0 reserved error codes used here. */
const ERR_INVALID_REQUEST = -32600;
const ERR_METHOD_NOT_FOUND = -32601;
const ERR_INVALID_PARAMS = -32602;

/** Build a JSON-RPC success envelope, defaulting a missing id to `null`. */
function success(id: string | number | null | undefined, result: unknown): JsonRpcSuccess {
  return { jsonrpc: '2.0', id: id ?? null, result };
}

/** Build a JSON-RPC error envelope, defaulting a missing id to `null`. */
function error(
  id: string | number | null | undefined,
  code: number,
  message: string,
): JsonRpcError {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message } };
}

/**
 * Dispatch a single parsed JSON-RPC message to the matching MCP handler.
 *
 * Returns a JSON-RPC response object, or `null` for notifications
 * (`notifications/*`) which by spec receive no reply. The caller is
 * responsible for JSON parsing and HTTP transport.
 */
export function handleMcpRequest(msg: JsonRpcMessage): JsonRpcResponse | null {
  // Reject anything that isn't a well-formed JSON-RPC request object.
  if (typeof msg !== 'object' || msg === null || typeof msg.method !== 'string') {
    const id = (msg as JsonRpcMessage | null | undefined)?.id ?? null;
    return error(id, ERR_INVALID_REQUEST, 'Invalid Request');
  }

  const method = msg.method;

  // Notifications never receive a response.
  if (method.startsWith('notifications/')) {
    return null;
  }

  switch (method) {
    case 'initialize': {
      const requested = msg.params?.protocolVersion;
      return success(msg.id, {
        protocolVersion: typeof requested === 'string' ? requested : MCP_PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: MCP_SERVER_INFO,
        instructions:
          'Call the generate_shades tool with a color to get its OKLCH ramp and Tailwind scale.',
      });
    }

    case 'ping':
      return success(msg.id, {});

    case 'tools/list':
      return success(msg.id, { tools: MCP_TOOLS });

    case 'tools/call':
      return handleToolCall(msg);

    default:
      return error(msg.id, ERR_METHOD_NOT_FOUND, 'Method not found');
  }
}

/** Handle `tools/call`, validating the tool name and `color` argument. */
function handleToolCall(msg: JsonRpcMessage): JsonRpcResponse {
  const name = msg.params?.name;
  if (name !== 'generate_shades') {
    return error(msg.id, ERR_INVALID_PARAMS, `Unknown tool: ${String(name)}`);
  }

  const args = msg.params?.arguments as Record<string, unknown> | undefined;
  const color = args?.color;
  if (typeof color !== 'string' || color === '') {
    return error(msg.id, ERR_INVALID_PARAMS, 'Missing required string argument: color');
  }

  try {
    const canonical = parseColor(color);
    const data = buildColorPageData(canonical);
    return success(msg.id, {
      content: [{ type: 'text', text: colorPageMarkdown(data) }],
      structuredContent: data,
    });
  } catch (e) {
    // Bad color input is a tool-level error (isError), not a protocol error -
    // the call succeeded, the tool just couldn't make sense of the argument.
    if (e instanceof ParseError) {
      return success(msg.id, {
        content: [{ type: 'text', text: 'Could not parse color: ' + color }],
        isError: true,
      });
    }
    // Anything else is unexpected; let the transport layer surface it.
    throw e;
  }
}
