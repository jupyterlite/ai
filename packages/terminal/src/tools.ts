import type { Contents } from '@jupyterlab/services';
import type { ITool } from '@jupyternaut/agent';
import type { CommandRegistry } from '@lumino/commands';
import { tool } from 'ai';
import { z } from 'zod';

import { stripAnsi } from './render/ansi';

/**
 * Where cockle mounts the JupyterLite contents.
 */
export const DRIVE_MOUNTPOINT = '/drive';

const SHELL_COMMANDS = {
  execute: '@jupyterlite/terminal:execute-shell',
  start: '@jupyterlite/terminal:start-shell',
  shutdown: '@jupyterlite/terminal:shutdown-shell'
};

const DEFAULT_SHELL_TIMEOUT_MS = 30000;
const MAX_OUTPUT_CHARS = 20000;
const MAX_READ_LINES = 2000;

export interface IShellResult {
  success: boolean;
  status: 'ok' | 'error' | 'timeout';
  output: string;
  exitCode: number | null;
  message: string;
}

/**
 * Normalize an absolute or cwd-relative cockle path.
 */
export function resolvePath(path: string, cwd: string): string {
  const raw = path.startsWith('/') ? path : `${cwd}/${path}`;
  const parts: string[] = [];
  for (const part of raw.split('/')) {
    if (part === '' || part === '.') {
      continue;
    }
    if (part === '..') {
      parts.pop();
    } else {
      parts.push(part);
    }
  }
  return '/' + parts.join('/');
}

/**
 * Convert an absolute cockle path to a contents manager path, or null when the
 * path lives outside the mounted drive.
 */
export function toContentsPath(absolutePath: string): string | null {
  if (absolutePath === DRIVE_MOUNTPOINT) {
    return '';
  }
  if (absolutePath.startsWith(DRIVE_MOUNTPOINT + '/')) {
    return absolutePath.slice(DRIVE_MOUNTPOINT.length + 1);
  }
  return null;
}

function shellQuote(value: string): string {
  return "'" + value.replace(/'/g, "'\\''") + "'";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function capOutput(text: string): { output: string; truncated: boolean } {
  if (text.length <= MAX_OUTPUT_CHARS) {
    return { output: text, truncated: false };
  }
  const half = Math.floor(MAX_OUTPUT_CHARS / 2);
  return {
    output:
      text.slice(0, half) +
      `\n\n… [${text.length - MAX_OUTPUT_CHARS} characters truncated] …\n\n` +
      text.slice(-half),
    truncated: true
  };
}

/**
 * Runs commands in a headless cockle shell sharing the terminal's file system.
 */
export class ShellRunner {
  constructor(commands: CommandRegistry, cwd: string) {
    this._commands = commands;
    this._cwd = cwd;
  }

  /**
   * Change the directory used for new shells and for the running one.
   */
  async setCwd(cwd: string): Promise<void> {
    if (cwd === this._cwd) {
      return;
    }
    this._cwd = cwd;
    if (this._shellName) {
      await this.run(`cd ${shellQuote(cwd)}`);
    }
  }

  /**
   * Start the headless shell ahead of time. Starting it while the terminal is
   * waiting for keyboard input can confuse the service worker stdin routing
   * of older JupyterLite versions.
   */
  async start(): Promise<void> {
    await this._ensureShell();
  }

  async run(
    code: string,
    timeout = DEFAULT_SHELL_TIMEOUT_MS
  ): Promise<IShellResult> {
    const shellName = await this._ensureShell();
    let result: IShellResult;
    try {
      result = (await this._commands.execute(SHELL_COMMANDS.execute, {
        code,
        shellName,
        timeout
      })) as unknown as IShellResult;
    } catch (error) {
      await this._discardShell();
      throw error;
    }
    if (result.status === 'timeout') {
      // The exec plugin refuses to reuse a shell whose command timed out.
      await this._discardShell();
    }
    return { ...result, output: stripAnsi(result.output ?? '') };
  }

  async dispose(): Promise<void> {
    await this._discardShell();
  }

  private async _ensureShell(): Promise<string> {
    if (!this._shellName) {
      const result = (await this._commands.execute(SHELL_COMMANDS.start, {
        cwd: this._cwd
      })) as { shellName: string };
      this._shellName = result.shellName;
    }
    return this._shellName;
  }

  private async _discardShell(): Promise<void> {
    const name = this._shellName;
    this._shellName = undefined;
    if (name) {
      try {
        await this._commands.execute(SHELL_COMMANDS.shutdown, {
          shellName: name
        });
      } catch {
        // The shell may already be gone.
      }
    }
  }

  private _commands: CommandRegistry;
  private _cwd: string;
  private _shellName?: string;
}

export interface ITerminalToolsOptions {
  contents: Contents.IManager;
  shell: ShellRunner;
  cwd: () => string;
  /**
   * Whether a tool call must be confirmed by the user before running.
   */
  needsApproval: (toolName: string) => boolean;
}

interface INumberedContent {
  content: string;
  totalLines: number;
  lines: number;
  offset: number;
  truncated: boolean;
}

function numberLines(
  text: string,
  offset = 0,
  limit = MAX_READ_LINES
): INumberedContent {
  const all = text.split('\n');
  const start = Math.max(0, offset);
  const slice = all.slice(start, start + Math.min(limit, MAX_READ_LINES));
  return {
    content: slice
      .map((line, index) => `${start + index + 1}\t${line}`)
      .join('\n'),
    totalLines: all.length,
    lines: slice.length,
    offset: start,
    truncated: start + slice.length < all.length
  };
}

function isNotebook(path: string): boolean {
  return path.endsWith('.ipynb');
}

async function readText(
  contents: Contents.IManager,
  contentsPath: string,
  absolutePath: string
): Promise<{ text: string } | { error: string }> {
  let model: Contents.IModel;
  try {
    model = await contents.get(
      contentsPath,
      isNotebook(absolutePath)
        ? { content: true, type: 'notebook', format: 'json' }
        : { content: true, type: 'file', format: 'text' }
    );
  } catch (error) {
    return { error: `Cannot read ${absolutePath}: ${errorMessage(error)}` };
  }
  if (model.type === 'directory') {
    return { error: `${absolutePath} is a directory, use list_files instead` };
  }
  if (model.type === 'notebook') {
    return { text: JSON.stringify(model.content, null, 1) };
  }
  return {
    text:
      typeof model.content === 'string'
        ? model.content
        : String(model.content ?? '')
  };
}

async function writeText(
  options: ITerminalToolsOptions,
  contentsPath: string,
  absolutePath: string,
  text: string
): Promise<void> {
  const parent = contentsPath.includes('/')
    ? contentsPath.slice(0, contentsPath.lastIndexOf('/'))
    : '';
  if (parent) {
    try {
      await options.contents.get(parent, { content: false });
    } catch {
      await options.shell.run(
        `mkdir -p ${shellQuote(`${DRIVE_MOUNTPOINT}/${parent}`)}`
      );
    }
  }
  if (isNotebook(absolutePath)) {
    await options.contents.save(contentsPath, {
      type: 'notebook',
      format: 'json',
      content: JSON.parse(text)
    });
  } else {
    await options.contents.save(contentsPath, {
      type: 'file',
      format: 'text',
      content: text
    });
  }
}

/**
 * Tools that give the agent access to the terminal's shell and files.
 */
export function createTerminalTools(
  options: ITerminalToolsOptions
): Record<string, ITool> {
  const { contents, shell } = options;

  const shellTool = tool({
    metadata: { title: 'Shell' },
    description:
      'Run a command line in the in-browser cockle shell that shares the file system of the terminal. ' +
      'The working directory persists between calls. Runs as a single pipeline: pipes (|), sequential separators (;) and file redirections (>, >>, 2>, <) are supported. ' +
      'Not supported: && and ||, command substitution ($(...) or backticks), $VAR expansion, 2>&1, python or node. ' +
      'Available commands include the coreutils (ls, cat, head, tail, wc, mkdir, cp, mv, rm, touch, sort, uniq, tr, cut, seq, date, stat...), grep, sed, tree and git; run "cockle-config command" to list them all.',
    inputSchema: z.object({
      command: z.string().describe('The command line to run'),
      timeout: z
        .number()
        .optional()
        .describe(
          `Maximum time to wait in milliseconds (default ${DEFAULT_SHELL_TIMEOUT_MS})`
        )
    }),
    needsApproval: () => options.needsApproval('shell'),
    execute: async ({
      command,
      timeout
    }: {
      command: string;
      timeout?: number;
    }) => {
      try {
        const result = await shell.run(
          command,
          timeout ?? DEFAULT_SHELL_TIMEOUT_MS
        );
        const { output, truncated } = capOutput(result.output);
        return {
          success: result.success,
          exitCode: result.exitCode,
          output,
          truncated,
          ...(result.status !== 'ok' && { message: result.message })
        };
      } catch (error) {
        return { success: false, error: errorMessage(error) };
      }
    }
  });

  const readFileTool = tool({
    metadata: { title: 'Read File' },
    description:
      'Read a text file. Returns the lines prefixed with their 1-based line number. ' +
      'Paths are absolute (the JupyterLite files live under /drive) or relative to the working directory. Notebooks are returned as JSON.',
    inputSchema: z.object({
      path: z.string().describe('Path of the file to read'),
      offset: z.number().optional().describe('0-based line to start from'),
      limit: z
        .number()
        .optional()
        .describe(
          `Maximum number of lines to return (default ${MAX_READ_LINES})`
        )
    }),
    execute: async ({
      path,
      offset,
      limit
    }: {
      path: string;
      offset?: number;
      limit?: number;
    }) => {
      const absolutePath = resolvePath(path, options.cwd());
      const contentsPath = toContentsPath(absolutePath);
      let text: string;
      if (contentsPath === null) {
        const result = await shell.run(`cat ${shellQuote(absolutePath)}`);
        if (!result.success) {
          return { success: false, error: result.output || result.message };
        }
        text = result.output;
      } else {
        const read = await readText(contents, contentsPath, absolutePath);
        if ('error' in read) {
          return { success: false, error: read.error };
        }
        text = read.text;
      }
      return {
        success: true,
        path: absolutePath,
        ...numberLines(text, offset, limit)
      };
    }
  });

  const writeFileTool = tool({
    metadata: { title: 'Write File' },
    description:
      'Create or overwrite a file under /drive with the given content. Parent directories are created as needed. Notebooks (.ipynb) must be valid JSON.',
    inputSchema: z.object({
      path: z.string().describe('Path of the file to write'),
      content: z.string().describe('The full content of the file')
    }),
    needsApproval: () => options.needsApproval('write_file'),
    execute: async ({ path, content }: { path: string; content: string }) => {
      const absolutePath = resolvePath(path, options.cwd());
      const contentsPath = toContentsPath(absolutePath);
      if (contentsPath === null || contentsPath === '') {
        return {
          success: false,
          error: `Only files under ${DRIVE_MOUNTPOINT} can be written`
        };
      }
      try {
        await writeText(options, contentsPath, absolutePath, content);
      } catch (error) {
        return {
          success: false,
          error: `Cannot write ${absolutePath}: ${errorMessage(error)}`
        };
      }
      return { success: true, path: absolutePath, bytes: content.length };
    }
  });

  const editFileTool = tool({
    metadata: { title: 'Edit File' },
    description:
      'Replace an exact string in a file under /drive. The old string must match exactly once unless replace_all is true. Read the file first to get the exact text.',
    inputSchema: z.object({
      path: z.string().describe('Path of the file to edit'),
      old_string: z.string().describe('The exact text to replace'),
      new_string: z.string().describe('The replacement text'),
      replace_all: z
        .boolean()
        .optional()
        .describe('Replace every occurrence (default false)')
    }),
    needsApproval: () => options.needsApproval('edit_file'),
    execute: async ({
      path,
      old_string,
      new_string,
      replace_all
    }: {
      path: string;
      old_string: string;
      new_string: string;
      replace_all?: boolean;
    }) => {
      const absolutePath = resolvePath(path, options.cwd());
      const contentsPath = toContentsPath(absolutePath);
      if (contentsPath === null || contentsPath === '') {
        return {
          success: false,
          error: `Only files under ${DRIVE_MOUNTPOINT} can be edited`
        };
      }
      const read = await readText(contents, contentsPath, absolutePath);
      if ('error' in read) {
        return { success: false, error: read.error };
      }
      if (old_string === '') {
        return { success: false, error: 'old_string must not be empty' };
      }
      const occurrences = read.text.split(old_string).length - 1;
      if (occurrences === 0) {
        return {
          success: false,
          error: `old_string was not found in ${absolutePath}`
        };
      }
      if (occurrences > 1 && !replace_all) {
        return {
          success: false,
          error: `old_string matches ${occurrences} times in ${absolutePath}; add more context to make it unique or set replace_all`
        };
      }
      const updated = replace_all
        ? read.text.split(old_string).join(new_string)
        : read.text.replace(old_string, () => new_string);
      try {
        await writeText(options, contentsPath, absolutePath, updated);
      } catch (error) {
        return {
          success: false,
          error: `Cannot write ${absolutePath}: ${errorMessage(error)}`
        };
      }
      return {
        success: true,
        path: absolutePath,
        replacements: replace_all ? occurrences : 1
      };
    }
  });

  const listFilesTool = tool({
    metadata: { title: 'List Files' },
    description:
      'List the entries of a directory (name, type, size). Defaults to the working directory.',
    inputSchema: z.object({
      path: z
        .string()
        .optional()
        .describe('Directory to list (default: the working directory)')
    }),
    execute: async ({ path }: { path?: string }) => {
      const absolutePath = resolvePath(path ?? '.', options.cwd());
      const contentsPath = toContentsPath(absolutePath);
      if (contentsPath === null) {
        const result = await shell.run(`ls -la ${shellQuote(absolutePath)}`);
        return result.success
          ? { success: true, path: absolutePath, output: result.output }
          : { success: false, error: result.output || result.message };
      }
      let model: Contents.IModel;
      try {
        model = await contents.get(contentsPath, { content: true });
      } catch (error) {
        return {
          success: false,
          error: `Cannot list ${absolutePath}: ${errorMessage(error)}`
        };
      }
      if (model.type !== 'directory') {
        return {
          success: true,
          path: absolutePath,
          entries: [{ name: model.name, type: model.type, size: model.size }]
        };
      }
      const entries = (model.content as Contents.IModel[])
        .map(entry => ({
          name: entry.name,
          type: entry.type,
          size: entry.size ?? undefined
        }))
        .sort(
          (a, b) =>
            Number(b.type === 'directory') - Number(a.type === 'directory') ||
            a.name.localeCompare(b.name)
        );
      return { success: true, path: absolutePath, entries };
    }
  });

  return {
    shell: shellTool,
    read_file: readFileTool,
    write_file: writeFileTool,
    edit_file: editFileTool,
    list_files: listFilesTool
  };
}
