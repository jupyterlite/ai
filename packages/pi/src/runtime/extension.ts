import {
  keyHint,
  type ExtensionAPI,
  type ExtensionContext,
  type ExtensionFactory,
  type McpServerConfig,
  type ToolDefinition
} from '@earendil-works/pi-coding-agent';
import type { TSchema } from '@earendil-works/pi-ai';
import { Text } from '@earendil-works/pi-tui';
import type {
  IAISettingsModel,
  ITool,
  IToolRegistry
} from '@jupyternaut/agent';
import type { IMcpManager } from 'jupyter-mcp-manager';

import { modelView } from './mime';
import { cockleOperations, type ShellRunner } from './shell';
import { toContentsPath } from './vfs';

/**
 * A user decision on a tool call.
 */
export type ApprovalDecision = 'allow' | 'always' | 'reject';

export interface IApprovalRequest {
  toolCallId: string;
  toolName: string;
  input: Record<string, unknown>;
  signal?: AbortSignal;
}

/**
 * Asks the user about a tool call, in the terminal or in the chat.
 */
export type ApprovalHandler = (
  request: IApprovalRequest,
  ctx: ExtensionContext
) => Promise<ApprovalDecision>;

export interface IJupyterExtensionOptions {
  toolRegistry?: IToolRegistry;
  settingsModel?: IAISettingsModel;
  shell?: ShellRunner;
  /**
   * Its HTTP servers go to pi's MCP extension.
   */
  mcpManager?: IMcpManager;
  approve: ApprovalHandler;
  /**
   * Called before pi reloads its resources (`/reload`).
   */
  onReload?: () => Promise<void>;
  /**
   * Called after each bash tool call, which can change files.
   */
  onBash?: () => void;
  /**
   * Interrupts the kernel of a JupyterLab command that pi stops.
   */
  interrupt?: InterruptHandler;
}

export type InterruptHandler = (
  commandId: string,
  args: Record<string, unknown>
) => void;

/**
 * Tools of the Jupyternaut registry that pi covers itself (skills).
 */
const SKIPPED_TOOLS = new Set(['discover_skills', 'load_skill']);

/**
 * pi tools that change files or run commands.
 */
const GUARDED_TOOLS = new Set(['bash', 'edit', 'write']);

const MAX_OUTPUT_CHARS = 50000;
const PREVIEW_LINES = 10;

/**
 * Instructions added to the pi system prompt.
 */
export const JUPYTER_INSTRUCTIONS = `You are running inside JupyterLab (or JupyterLite), in the web browser of the user.
- ${'`'}/drive${'`'} is the root of the JupyterLab file browser. The read, write, edit, ls, find and grep tools work on these files; use paths under /drive or relative to the working directory.
- The MCP servers come from the MCP settings of JupyterLab: pi does not read mcp.json.
- The pi docs describe pi in Node.js. In the browser, the pi examples are not available, and pi extensions and packages from files, the account sign-in of /login (except OpenRouter), /share and /bug do not work.`;

/**
 * Rules of the Jupyternaut registry tools, in the pi system prompt.
 */
const TOOL_GUIDELINES: Record<string, string[]> = {
  discover_commands: [
    'Call discover_commands with the query "jupyterlab-ai-commands" to get the commands for files, notebooks and kernels. For other commands, use one or two keywords: each word must be in the id, label or caption of a command (for example "terminal").'
  ],
  execute_command: [
    'Never guess a command id: use an id that discover_commands returned, and give args as a JSON object that follows the args schema of the command.',
    'JupyterLab commands take paths relative to the root of the file browser, without /drive (/drive/data/a.ipynb is data/a.ipynb), and not relative to the working directory.',
    'To run code (Python or another kernel language), start a kernel with jupyterlab-ai-commands:start-kernel (or use one from jupyterlab-ai-commands:list-kernels), then run the code with jupyterlab-ai-commands:execute-in-kernel and its kernelId. Bash cannot run Python. Use a notebook only when the user asks for one or the work must be kept.',
    'Create, change and run notebooks with the jupyterlab-ai-commands notebook commands (create-notebook, get-notebook-info, add-cell, set-cell-content, run-cell, get-cell-info), with notebookPath: without it, they act on the active notebook. In a new notebook, add-cell replaces the empty first cell. Do not change the .ipynb JSON with write or edit.',
    'Cell IDs, cell positions and execution counts (In [6]) are different: get the current cells of a notebook before you change them.',
    'Read the result of each command (outputs, errors) before you say that a task is done.'
  ]
};

function summarize(toolName: string, input: Record<string, unknown>): string {
  switch (toolName) {
    case 'bash':
      return String(input.command ?? '');
    case 'edit':
    case 'write':
      return String(input.path ?? '');
    case 'execute_command':
      return String(input.commandId ?? '');
    case 'browser_fetch':
      return String(input.url ?? '');
  }
  const text = JSON.stringify(input);
  return text.length > 120 ? `${text.slice(0, 117)}...` : text;
}

/**
 * The JSON schema of the input of an AI SDK tool (zod or JSON schema).
 */
function inputJsonSchema(tool: ITool): Record<string, unknown> {
  const schema = tool.inputSchema as any;
  let json: Record<string, unknown> | undefined;
  if (typeof schema?.toJSONSchema === 'function') {
    // The model writes the input of transforms, as in the AI SDK. Types
    // without a JSON schema (dates) accept any value.
    json = schema.toJSONSchema({ io: 'input', unrepresentable: 'any' });
  } else if (schema?.jsonSchema && typeof schema.jsonSchema === 'object') {
    json = schema.jsonSchema;
  }
  const result = { ...(json ?? { type: 'object', properties: {} }) };
  delete result.$schema;
  return result;
}

/**
 * The input of a tool call as the tool expects it: zod schemas apply their
 * defaults and transforms, as in the AI SDK.
 */
async function parseInput(name: string, tool: ITool, params: unknown) {
  const schema = tool.inputSchema as any;
  if (typeof schema?.safeParseAsync !== 'function') {
    return params;
  }
  const result = await schema.safeParseAsync(params);
  if (!result.success) {
    throw new Error(`Invalid input for ${name}: ${result.error?.message}`);
  }
  return result.data;
}

/**
 * The final output of a tool, which can stream its results.
 */
async function settle(output: unknown): Promise<unknown> {
  if (typeof (output as any)?.[Symbol.asyncIterator] !== 'function') {
    return output;
  }
  let last: unknown;
  for await (const value of output as AsyncIterable<unknown>) {
    last = value;
  }
  return last;
}

/**
 * Arguments of the JupyterLab commands that hold a path, such as `path`,
 * `notebookPath` or `cwd`.
 */
const PATH_ARGUMENT = /^cwd$|path$/i;

/**
 * The arguments of a JupyterLab command with contents paths: commands do not
 * know the /drive paths of the pi tools.
 */
function commandInput(params: unknown): unknown {
  const { args } = (params ?? {}) as { args?: unknown };
  if (!args || typeof args !== 'object' || Array.isArray(args)) {
    return params;
  }
  const converted = Object.entries(args).map(([key, value]) => [
    key,
    PATH_ARGUMENT.test(key) && typeof value === 'string'
      ? (toContentsPath(value) ?? value)
      : value
  ]);
  return { ...(params as object), args: Object.fromEntries(converted) };
}

/**
 * The commands of a discover_commands result without their arguments, when
 * the full result is too long.
 */
function commandList(output: unknown): string | undefined {
  const commands = (output as { commands?: unknown } | null)?.commands;
  if (!Array.isArray(commands)) {
    return undefined;
  }
  const lines = commands.map(({ id, label }) =>
    label ? `${id}: ${label}` : String(id)
  );
  return `${commands.length} commands. Call discover_commands with a query to get their arguments.\n${lines.join('\n')}`;
}

/**
 * Settle with the promise, or reject when the signal aborts: a JupyterLab
 * command cannot be cancelled.
 */
function abortable<T>(
  promise: Promise<T>,
  signal: AbortSignal | undefined,
  onAbort: () => void
): Promise<T> {
  if (!signal) {
    return promise;
  }
  return new Promise<T>((resolve, reject) => {
    const abort = () => {
      onAbort();
      reject(new Error('Operation aborted'));
    };
    if (signal.aborted) {
      abort();
      return;
    }
    signal.addEventListener('abort', abort, { once: true });
    promise
      .then(resolve, reject)
      .finally(() => signal.removeEventListener('abort', abort));
  });
}

/**
 * The result of a registry tool in the terminal: its JSON output is one long
 * line, shown indented and collapsed to a few lines as pi does.
 */
const renderResult: NonNullable<ToolDefinition['renderResult']> = (
  result,
  { expanded },
  theme
) => {
  let output = result.content
    .map(part => (part.type === 'text' ? part.text : ''))
    .join('\n');
  try {
    output = JSON.stringify(JSON.parse(output), null, 2);
  } catch {
    // Not JSON: show the text as it is.
  }
  const lines = output.split('\n');
  const shown = expanded ? lines : lines.slice(0, PREVIEW_LINES);
  let text = shown.map(line => theme.fg('toolOutput', line)).join('\n');
  if (lines.length > shown.length) {
    text += `${theme.fg('muted', `\n... (${lines.length - shown.length} more lines,`)} ${keyHint('app.tools.expand', 'to expand')}${theme.fg('muted', ')')}`;
  }
  return new Text(text, 0, 0);
};

/**
 * A Jupyternaut registry tool (AI SDK) as a pi tool.
 */
function bridgeTool(
  name: string,
  tool: ITool,
  interrupt?: InterruptHandler
): ToolDefinition {
  const title = (tool as { metadata?: { title?: string } }).metadata?.title;
  const description =
    typeof tool.description === 'string' ? tool.description : name;
  return {
    name,
    label: title ?? name,
    description,
    promptSnippet: description.split(/(?<=\.)\s/)[0],
    promptGuidelines: TOOL_GUIDELINES[name],
    parameters: inputJsonSchema(tool) as unknown as TSchema,
    renderResult,
    async execute(toolCallId, params, signal) {
      if (!tool.execute) {
        throw new Error(`The tool ${name} cannot run in the browser`);
      }
      const input = (
        name === 'execute_command' ? commandInput(params) : params
      ) as { commandId?: string; args?: Record<string, unknown> };
      const run = async () =>
        settle(
          await tool.execute!(await parseInput(name, tool, input), {
            toolCallId,
            messages: [],
            abortSignal: signal,
            context: {}
          })
        );
      const output = await abortable(run(), signal, () => {
        if (name === 'execute_command' && input.commandId) {
          interrupt?.(input.commandId, input.args ?? {});
        }
      });
      const { value, images } = modelView(output);
      let text =
        typeof value === 'string' ? value : (JSON.stringify(value) ?? 'Done');
      if (text.length > MAX_OUTPUT_CHARS && name === 'discover_commands') {
        text = commandList(output) ?? text;
      }
      if (text.length > MAX_OUTPUT_CHARS) {
        text = `${text.slice(0, MAX_OUTPUT_CHARS)}\n\n[Output truncated: ${text.length} characters]`;
      }
      return {
        content: [{ type: 'text', text }, ...images],
        // The chat renders the MIME bundles of execute_command.
        details: name === 'execute_command' ? output : undefined,
        isError: (output as { success?: unknown } | null)?.success === false
      };
    }
  } as ToolDefinition;
}

/**
 * The approval scope remembered by "always allow": a tool, or one command.
 */
function approvalScope(toolName: string, input: Record<string, unknown>) {
  return toolName === 'execute_command'
    ? `${toolName} ${String(input.commandId)}`
    : toolName;
}

/**
 * The pi extension for Jupyter: JupyterLab tools of the Jupyternaut
 * registry, MCP servers, tool approvals and `!command` in cockle.
 */
export function jupyterExtension(
  options: IJupyterExtensionOptions
): ExtensionFactory {
  return async (pi: ExtensionAPI) => {
    const policies = new Map<string, ITool['needsApproval']>();
    const allowed = new Set<string>();

    const needsApproval = async (
      toolName: string,
      input: Record<string, unknown>,
      toolCallId: string
    ): Promise<boolean> => {
      if (GUARDED_TOOLS.has(toolName)) {
        return true;
      }
      if (toolName === 'execute_command') {
        const commands =
          options.settingsModel?.config.commandsRequiringApproval;
        return commands ? commands.includes(String(input.commandId)) : true;
      }
      if (toolName.startsWith('mcp__')) {
        const tool = pi
          .getAllTools()
          .find(candidate => candidate.name === toolName);
        return tool?.annotations?.readOnlyHint !== true;
      }
      const policy = policies.get(toolName);
      return typeof policy === 'function'
        ? !!(await policy(input as never, {
            toolCallId,
            messages: [],
            context: {}
          }))
        : !!policy;
    };

    // pi stops after a tool batch only when every result asks for it: after a
    // rejection, block the rest of the turn, and abort if a call runs anyway.
    let rejected = false;
    const unblocked = new Set<string>();
    pi.on('turn_start', () => {
      rejected = false;
      unblocked.clear();
    });
    pi.on('tool_execution_start', event => {
      unblocked.add(event.toolCallId);
    });
    pi.on('tool_execution_end', (event, ctx) => {
      if (rejected && unblocked.size && !ctx.signal?.aborted) {
        ctx.abort();
      }
    });

    // Registered before the tools: a tool that fails to load must not leave
    // the session without approvals.
    pi.on('tool_call', async (event, ctx) => {
      if (rejected) {
        unblocked.delete(event.toolCallId);
        return {
          block: true,
          reason: 'Not run: the user rejected another tool call of this turn.',
          terminate: true
        };
      }
      const input = event.input as Record<string, unknown>;
      const scope = approvalScope(event.toolName, input);
      if (
        allowed.has(scope) ||
        !(await needsApproval(event.toolName, input, event.toolCallId))
      ) {
        return;
      }
      const decision = await options.approve(
        {
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          input,
          signal: ctx.signal
        },
        ctx
      );
      if (decision === 'always') {
        allowed.add(scope);
      }
      if (decision === 'reject') {
        rejected = true;
        unblocked.delete(event.toolCallId);
        return {
          block: true,
          reason: `The user rejected the ${event.toolName} call.`,
          terminate: true
        };
      }
    });

    pi.on('tool_result', event => {
      if (event.toolName === 'bash') {
        options.onBash?.();
      }
    });

    const manager = options.mcpManager;
    const registerServers = () => {
      const servers = new Map<string, McpServerConfig>();
      for (const server of manager?.getMCPServers() ?? []) {
        if (server.type !== 'http' || server.disabled) {
          continue;
        }
        // pi gives `a-b` and `a_b` the same tool names.
        const name = server.name.replace(/[^A-Za-z0-9_]/g, '_');
        if (servers.has(name)) {
          console.warn(`pi: the MCP server name "${server.name}" is taken`);
          continue;
        }
        servers.set(name, {
          url: server.url,
          headers: Object.fromEntries(
            (server.headers ?? []).map(header => [header.name, header.value])
          ),
          exposure: 'direct'
        });
      }
      for (const { name } of pi.getMcpServers()) {
        if (!servers.has(name)) {
          pi.unregisterMcpServer(name);
        }
      }
      for (const [name, config] of servers) {
        try {
          pi.registerMcpServer(name, config);
        } catch (error) {
          console.warn(`pi: cannot add the MCP server "${name}"`, error);
        }
      }
    };
    registerServers();
    manager?.serversChanged.connect(registerServers);

    pi.on('session_shutdown', async event => {
      manager?.serversChanged.disconnect(registerServers);
      if (event.reason === 'reload') {
        await options.onReload?.();
      }
    });

    if (options.shell) {
      const operations = cockleOperations(options.shell);
      pi.on('user_bash', () => ({ operations }));
    }

    for (const [name, tool] of Object.entries(
      options.toolRegistry?.tools ?? {}
    )) {
      if (SKIPPED_TOOLS.has(name)) {
        continue;
      }
      try {
        policies.set(name, tool.needsApproval);
        pi.registerTool(bridgeTool(name, tool, options.interrupt));
      } catch (error) {
        console.warn(`pi: cannot add the ${name} tool`, error);
      }
    }
  };
}

/**
 * Approvals in pi's own terminal UI.
 */
export const terminalApproval: ApprovalHandler = async (request, ctx) => {
  const summary = summarize(request.toolName, request.input);
  const choice = await ctx.ui.select(
    `Allow ${request.toolName}${summary ? `: ${summary}` : ''}?`,
    [
      'Yes',
      `Yes, and do not ask again for ${approvalScope(request.toolName, request.input)}`,
      'No'
    ],
    { signal: request.signal }
  );
  if (choice === 'Yes') {
    return 'allow';
  }
  return choice?.startsWith('Yes,') ? 'always' : 'reject';
};
