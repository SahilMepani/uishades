/**
 * WebMCP - expose the shade tool to in-browser AI agents via the experimental
 * `navigator.modelContext` API.
 *
 * When an agent-capable browser is driving the page, it can call these tools to
 * change the displayed color or read the current palette instead of scripting
 * the UI. This is the in-page counterpart to the server-side `/mcp` endpoint;
 * both expose the same OKLCH ramp + Tailwind scale data via
 * `buildColorPageData` / `colorPageMarkdown`.
 *
 * The API is a draft and absent in most browsers, so everything here is
 * feature-detected and wrapped in try/catch - on an unsupporting browser
 * `registerWebMcpTools` is a no-op that returns an empty cleanup. We support
 * both shapes seen in the proposal: per-tool `registerTool()` (preferred,
 * returns an unregister handle) and the batch `provideContext({ tools })`.
 */
import { parseColor, ParseError } from '../color/parse';
import { buildColorPageData } from '../color/page-data';
import { colorPageMarkdown } from '../markdown/color-page';
import type { Hex } from '../color/types';

interface WebMcpDeps {
  /** Latest displayed hex (read at call time, not registration time). */
  getHex: () => Hex;
  /** Apply a new color to the tool as if the user picked it. */
  setColor: (hex: Hex) => void;
}

interface ToolResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

interface WebMcpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (input: unknown) => Promise<ToolResult> | ToolResult;
}

function text(t: string, isError = false): ToolResult {
  return { content: [{ type: 'text', text: t }], isError };
}

/** Pull a `color` argument out of whatever shape the host passes execute(). */
function readColorArg(input: unknown): string | undefined {
  if (typeof input !== 'object' || input === null) return undefined;
  const obj = input as Record<string, unknown>;
  const direct = obj.color;
  if (typeof direct === 'string') return direct;
  const nested = (obj.arguments as Record<string, unknown> | undefined)?.color;
  return typeof nested === 'string' ? nested : undefined;
}

function buildTools({ getHex, setColor }: WebMcpDeps): WebMcpTool[] {
  return [
    {
      name: 'set_color',
      description:
        'Set the active color in UIshades and return its OKLCH tints-and-shades ramp plus 11-stop Tailwind scale. Accepts a hex, rgb()/hsl()/oklch(), or a CSS color name.',
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
      execute: (input) => {
        const raw = readColorArg(input);
        if (!raw) return text('Missing required string argument: color', true);
        try {
          const canonical = parseColor(raw);
          setColor(canonical);
          return text(colorPageMarkdown(buildColorPageData(canonical)));
        } catch (e) {
          if (e instanceof ParseError) return text(`Could not parse color: ${raw}`, true);
          throw e;
        }
      },
    },
    {
      name: 'get_current_palette',
      description:
        'Return the OKLCH ramp and Tailwind scale for the color currently shown in UIshades.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      execute: () => text(colorPageMarkdown(buildColorPageData(getHex()))),
    },
  ];
}

/**
 * Register the tools with `navigator.modelContext`. Returns a cleanup function
 * (safe to call even when nothing was registered).
 */
export function registerWebMcpTools(deps: WebMcpDeps): () => void {
  if (typeof navigator === 'undefined') return () => {};
  const mc = (navigator as unknown as { modelContext?: unknown }).modelContext as
    | {
        registerTool?: (tool: WebMcpTool) => { unregister?: () => void } | void;
        provideContext?: (ctx: { tools: WebMcpTool[] }) => void;
      }
    | undefined;
  if (!mc) return () => {};

  const tools = buildTools(deps);

  try {
    if (typeof mc.registerTool === 'function') {
      const handles = tools.map((t) => mc.registerTool!(t));
      return () => {
        for (const h of handles) {
          try {
            h?.unregister?.();
          } catch {
            /* ignore */
          }
        }
      };
    }
    if (typeof mc.provideContext === 'function') {
      mc.provideContext({ tools });
      // provideContext replaces the context wholesale; clear on cleanup.
      return () => {
        try {
          mc.provideContext!({ tools: [] });
        } catch {
          /* ignore */
        }
      };
    }
  } catch {
    /* a draft API may throw on unexpected shapes - degrade silently */
  }
  return () => {};
}
