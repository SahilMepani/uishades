/**
 * Unit tests for the framework-free MCP JSON-RPC 2.0 dispatcher
 * (src/lib/mcp/handler.ts).
 *
 * Covers the `initialize` handshake, the no-reply contract for
 * `notifications/*`, tool discovery via `tools/list`, a successful and a
 * failing `generate_shades` `tools/call`, and the JSON-RPC error codes for
 * unknown tools (-32602) and unknown methods (-32601). Also asserts the
 * JSON-RPC `id` is echoed back through the response envelope.
 */
import { describe, it, expect } from 'vitest';
import { handleMcpRequest } from '../src/lib/mcp/handler';

describe('handleMcpRequest — initialize', () => {
  it('returns UIshades server info, tools capability, and echoes protocolVersion + id', () => {
    const res = handleMcpRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2024-11-05' },
    });
    expect(res).not.toBeNull();
    expect(res).toHaveProperty('result');
    const r = (res as { id: unknown; result: any });
    expect(r.id).toBe(1);
    expect(r.result.serverInfo.name).toBe('UIshades');
    expect(r.result.capabilities.tools).toBeDefined();
    expect(r.result.protocolVersion).toBe('2024-11-05');
  });
});

describe('handleMcpRequest — notifications', () => {
  it('returns null for notifications/initialized', () => {
    const res = handleMcpRequest({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    });
    expect(res).toBeNull();
  });
});

describe('handleMcpRequest — tools/list', () => {
  it('lists a tool named generate_shades', () => {
    const res = handleMcpRequest({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
    const r = res as { result: { tools: { name: string }[] } };
    expect(r.result.tools.some((t) => t.name === 'generate_shades')).toBe(true);
  });
});

describe('handleMcpRequest — tools/call generate_shades', () => {
  it('returns text content + structuredContent with a hex input, no isError', () => {
    const res = handleMcpRequest({
      jsonrpc: '2.0',
      id: 'call-1',
      method: 'tools/call',
      params: { name: 'generate_shades', arguments: { color: '#4040ff' } },
    });
    const r = res as { id: unknown; result: any };
    expect(r.id).toBe('call-1');
    expect(r.result.content[0].type).toBe('text');
    expect(typeof r.result.content[0].text).toBe('string');
    expect(typeof r.result.structuredContent.input).toBe('string');
    expect(r.result.structuredContent.input).toMatch(/^#[0-9a-f]{6}$/);
    expect(r.result.isError).toBeFalsy();
  });

  it('flags an unparseable color as a tool-level error (isError)', () => {
    const res = handleMcpRequest({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'generate_shades', arguments: { color: 'notacolor!!' } },
    });
    const r = res as { result: { isError?: boolean } };
    expect(r.result.isError).toBe(true);
  });

  it('rejects an unknown tool name with -32602 (invalid params)', () => {
    const res = handleMcpRequest({
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: { name: 'no_such_tool', arguments: {} },
    });
    const r = res as { error: { code: number } };
    expect(r.error.code).toBe(-32602);
  });
});

describe('handleMcpRequest — unknown method', () => {
  it('returns -32601 (method not found)', () => {
    const res = handleMcpRequest({ jsonrpc: '2.0', id: 5, method: 'does/not/exist' });
    const r = res as { id: unknown; error: { code: number } };
    expect(r.error.code).toBe(-32601);
    expect(r.id).toBe(5);
  });
});
