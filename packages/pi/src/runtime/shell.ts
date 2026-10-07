import {
  createBashToolDefinition,
  type BashOperations,
  type ToolDefinition
} from '@earendil-works/pi-coding-agent';
import type { CommandRegistry } from '@lumino/commands';

import { DRIVE } from './vfs';

const SHELL_COMMANDS = {
  execute: '@jupyterlite/terminal:execute-shell',
  start: '@jupyterlite/terminal:start-shell',
  shutdown: '@jupyterlite/terminal:shutdown-shell'
};

const DEFAULT_TIMEOUT_SECONDS = 120;
const CD_TIMEOUT_MS = 10000;

export const ANSI_PATTERN =
  // eslint-disable-next-line no-control-regex
  /\x1b(?:\[[0-?]*[ -/]*[@-~]|\][^\x07\x1b]*(?:\x07|\x1b\\)|[@-Z\\-_])/g;

const COCKLE_DESCRIPTION =
  'Execute a command line in cockle, the in-browser shell of JupyterLite (WebAssembly builds of common tools), in the current working directory. ' +
  'Pipes (|), command lists (;, && and ||) and file redirections (>, >>, 2>, <) are supported. ' +
  'Not supported: command substitution ($(...) or backticks), $VAR expansion, 2>&1, python, node, pip or network access. ' +
  'Commands read an empty stdin. ' +
  'Available commands include the coreutils (ls, cat, head, tail, wc, mkdir, cp, mv, rm, touch, sort, uniq, tr, cut, seq, date, stat...), grep, sed, tree and git; run "cockle-config command" to list them all. ' +
  'Returns stdout and stderr. Optionally provide a timeout in seconds.';

interface IShellPart {
  /**
   * How the part runs after the part before: always, on success or on
   * failure.
   */
  operator: ';' | '&&' | '||';
  code: string;
}

interface IShellResult {
  success: boolean;
  status: 'ok' | 'error' | 'timeout';
  output: string;
  exitCode: number | null;
  message: string;
}

/**
 * Whether the page has the headless cockle shells of JupyterLite terminals.
 */
export function hasCockleShell(commands: CommandRegistry): boolean {
  return commands.hasCommand(SHELL_COMMANDS.execute);
}

/**
 * cockle has no escape character: each `'` goes in double quotes, in the
 * same word.
 */
function quote(value: string): string {
  return "'" + value.replace(/'/g, "'\"'\"'") + "'";
}

/**
 * cockle echoes the lines of a multi-line command: show them as written.
 */
function restoreEcho(output: string, code: string, rewritten: string): string {
  const original = code.split('\n');
  return rewritten
    .split('\n')
    .reduce(
      (text, line, index) =>
        line === original[index]
          ? text
          : text.split(line).join(original[index]),
      output
    );
}

/**
 * The command line with `< /dev/null` on the first command of each pipeline
 * without an input redirect: a headless command that reads stdin would wait
 * until the timeout, as no keyboard answers it. The text from the first
 * heredoc on stays as written.
 */
function withEmptyStdin(code: string): string {
  let result = '';
  let command = '';
  let quoted = '';
  let first = true;
  let input = false;
  const close = (separator: string) => {
    const body = command.replace(/(?:\s|\\\n)+$/, '');
    if (first && !input && !quoted && body.trim()) {
      command = `${body} < /dev/null${command.slice(body.length)}`;
    }
    result += command + separator;
    command = '';
    input = false;
    first = separator !== '|';
  };
  for (let i = 0; i < code.length; i++) {
    const char = code[i];
    if (quoted) {
      quoted = char === quoted ? '' : quoted;
    } else if (char === "'" || char === '"') {
      quoted = char;
    } else if (
      char === '\n' &&
      !command.endsWith('\\') &&
      (first || command.trim())
    ) {
      // A newline after `\` or `|` continues the command.
      close(char);
      continue;
    } else if (char === '&' && /[<>]$/.test(command)) {
      // cockle rejects 2>&1: keep it whole for a clear error.
      command += char;
      continue;
    } else if (code.startsWith('<<', i)) {
      // cockle reads the next lines as the heredoc.
      return result + command + code.slice(i);
    } else if (';&|<>'.includes(char)) {
      let token = char;
      while (code[i + 1] === char) {
        token += code[++i];
      }
      if (token === ';' || token === '&' || token === '|') {
        close(token);
        continue;
      }
      input ||= char === '<';
      command += token;
      continue;
    }
    command += char;
  }
  close('');
  return result;
}

/**
 * The parts of a command line with `&&` or `||`, which cockle does not run:
 * each part runs on its own, after the operator that joins it to the part
 * before. Null for a line without them, or with a heredoc.
 */
function andOrParts(code: string): IShellPart[] | null {
  const parts: IShellPart[] = [];
  let part = '';
  let operator: IShellPart['operator'] = ';';
  let quoted = '';
  let found = false;
  const end = (next: IShellPart['operator']) => {
    if (part.trim()) {
      parts.push({ operator, code: part });
      part = '';
      operator = next;
    } else if (next !== ';') {
      operator = next;
    }
  };
  for (let i = 0; i < code.length; i++) {
    const char = code[i];
    if (quoted) {
      quoted = char === quoted ? '' : quoted;
    } else if (char === "'" || char === '"') {
      quoted = char;
    } else if (code.startsWith('<<', i)) {
      return null;
    } else if (code.startsWith('&&', i) || code.startsWith('||', i)) {
      end(code.slice(i, i + 2) as IShellPart['operator']);
      found = true;
      i++;
      continue;
    } else if (
      char === ';' ||
      (char === '\n' && !part.endsWith('\\') && !/\|\s*$/.test(part))
    ) {
      end(';');
      continue;
    }
    part += char;
  }
  end(';');
  return found ? parts : null;
}

/**
 * Settle with the promise, or reject with `aborted` when the signal aborts
 * first.
 */
function abortable<T>(
  promise: Promise<T>,
  signal: AbortSignal | undefined,
  onAbort: () => void
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const abort = () => {
      onAbort();
      reject(new Error('aborted'));
    };
    if (signal?.aborted) {
      abort();
    }
    signal?.addEventListener('abort', abort, { once: true });
    void promise
      .then(resolve, reject)
      .finally(() => signal?.removeEventListener('abort', abort));
  });
}

/**
 * Runs commands in a headless cockle shell that shares the file system of
 * the JupyterLite terminals. A shell runs one command at a time, so the
 * commands wait in a queue.
 */
export class ShellRunner {
  constructor(commands: CommandRegistry) {
    this._commands = commands;
  }

  /**
   * The name of the shell, started on first use.
   */
  start(): Promise<string> {
    if (this._shellName) {
      return Promise.resolve(this._shellName);
    }
    if (!this._starting) {
      const generation = this._generation;
      const starting = (async () => {
        const { shellName } = (await this._commands.execute(
          SHELL_COMMANDS.start,
          { cwd: DRIVE }
        )) as { shellName: string };
        if (generation !== this._generation) {
          void this._abandon(shellName);
          throw new Error('The shell is disposed');
        }
        this._shellName = shellName;
        return shellName;
      })();
      const reset = () => {
        if (this._starting === starting) {
          this._starting = undefined;
        }
      };
      void starting.then(reset, reset);
      this._starting = starting;
    }
    return this._starting;
  }

  /**
   * Run a command line in a working directory once the queued commands are
   * done. An abort stops the shell: cockle cannot interrupt a command.
   */
  exec(
    code: string,
    cwd: string,
    timeoutMs: number,
    signal?: AbortSignal
  ): Promise<IShellResult> {
    const previous = this._queue;
    let shellName: string | undefined;
    const check = () => {
      if (signal?.aborted) {
        throw new Error('aborted');
      }
    };
    const run = async () => {
      check();
      shellName = await this.start();
      check();
      const moved = await this._run(
        shellName,
        `cd ${quote(cwd)}`,
        CD_TIMEOUT_MS
      );
      check();
      if (!moved.success) {
        throw new Error(
          `Cannot change to the working directory ${cwd}: ${moved.output.trim() || moved.message}`
        );
      }
      const parts = andOrParts(code) ?? [{ operator: ';', code }];
      const deadline = Date.now() + timeoutMs;
      let output = '';
      let last: IShellResult | undefined;
      for (const part of parts) {
        const failed = last?.exitCode !== 0;
        if (
          last &&
          ((part.operator === '&&' && failed) ||
            (part.operator === '||' && !failed))
        ) {
          continue;
        }
        check();
        const rewritten = withEmptyStdin(part.code);
        last = await this._run(
          shellName,
          rewritten,
          Math.max(1, deadline - Date.now())
        );
        output += restoreEcho(last.output, part.code, rewritten);
        if (last.status === 'timeout') {
          break;
        }
      }
      return { ...last!, output };
    };
    const result = abortable(previous.then(run), signal, () => {
      if (shellName) {
        void this._abandon(shellName);
      }
    });
    this._queue = Promise.allSettled([previous, result]);
    return result;
  }

  async dispose(): Promise<void> {
    this._generation++;
    this._starting = undefined;
    if (this._shellName) {
      await this._abandon(this._shellName);
    }
  }

  private async _run(
    shellName: string,
    code: string,
    timeoutMs: number
  ): Promise<IShellResult> {
    try {
      const result = (await this._commands.execute(SHELL_COMMANDS.execute, {
        code,
        shellName,
        timeout: timeoutMs
      })) as unknown as IShellResult;
      if (result.status === 'timeout') {
        // The exec plugin refuses to reuse a shell whose command timed out.
        void this._abandon(shellName);
      }
      return { ...result, output: result.output.replace(ANSI_PATTERN, '') };
    } catch (error) {
      void this._abandon(shellName);
      throw error;
    }
  }

  /**
   * Shut down a shell; the next command starts a new one.
   */
  private async _abandon(shellName: string): Promise<void> {
    if (this._shellName === shellName) {
      this._shellName = undefined;
    }
    try {
      await this._commands.execute(SHELL_COMMANDS.shutdown, { shellName });
    } catch {
      // The shell may already be gone.
    }
  }

  private _commands: CommandRegistry;
  private _shellName?: string;
  private _starting?: Promise<string>;
  private _generation = 0;
  private _queue: Promise<unknown> = Promise.resolve();
}

/**
 * pi bash operations over a cockle shell: each command starts in the given
 * working directory, the output arrives in one chunk.
 */
export function cockleOperations(shell: ShellRunner): BashOperations {
  return {
    exec: async (command, cwd, { onData, signal, timeout }) => {
      const seconds = timeout ?? DEFAULT_TIMEOUT_SECONDS;
      const result = await shell.exec(command, cwd, seconds * 1000, signal);
      if (result.output) {
        onData(Buffer.from(result.output));
      }
      if (result.status === 'timeout') {
        throw new Error(`timeout:${seconds}`);
      }
      return { exitCode: result.exitCode ?? 1 };
    }
  };
}

/**
 * pi's bash tool, running in cockle. A batch with a command runs in order:
 * the command must see the files that the calls before it saved.
 */
export function createCockleBashTool(
  cwd: string,
  shell: ShellRunner
): ToolDefinition {
  return {
    ...createBashToolDefinition(cwd, {
      operations: cockleOperations(shell),
      exposeSessionEnvironment: false
    }),
    description: COCKLE_DESCRIPTION,
    promptSnippet:
      'Run commands in cockle, the in-browser shell (limited shell syntax, no python or network)',
    executionMode: 'sequential'
  } as ToolDefinition;
}
