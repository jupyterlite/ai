import {
  createBashToolDefinition,
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  type BashOperations,
  type ToolDefinition
} from '@earendil-works/pi-coding-agent';
import type { CommandRegistry } from '@lumino/commands';
import path from 'path';

import type { DriveOperations } from './drive';
import { DRIVE, toContentsPath } from './vfs';

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
  'Pipes (|), command lists (; or newlines) and file redirections (>, >>, 2>, <) are supported. ' +
  'Not supported: && and || (run the commands in separate calls), command substitution ($(...) or backticks), $VAR expansion, python, node, pip or network access. ' +
  'stdout and stderr both go to the output (2>&1 has no effect). ' +
  'Commands read an empty stdin. ' +
  'Only /drive is shared with the file tools, the kernels and JupyterLab. ' +
  'Available commands include the coreutils (ls, cat, head, tail, wc, mkdir, cp, mv, rm, touch, sort, uniq, tr, cut, seq, date, stat...), grep, sed, tree and git; run "cockle-config command" to list them all. ' +
  `Returns stdout and stderr. Output is truncated to the last ${DEFAULT_MAX_LINES} lines or ${DEFAULT_MAX_BYTES / 1024}KB (whichever is hit first); the full output is then saved to a /tmp file that only the read and grep tools can open. ` +
  'Optionally provide a timeout in seconds.';

/**
 * TAB, Ctrl-D, Ctrl-L, ESC and DEL, which cockle's line editor reads as keys.
 */
// eslint-disable-next-line no-control-regex
const KEYS = /[\t\x04\x0c\x1b\x7f]/;
const NON_ASCII = /[\u0080-\uffff]/;
const WORD = / *((?:'[^']*'|"[^"]*"|[^\s;&|<>'"])*)/y;
/**
 * cockle writes each byte above 0x7f of a redirected output as a character
 * from U+FF80 to U+FFFF.
 */
const BYTE_RUNS = /[\uff80-\uffff]+/g;
/**
 * Spaces and line continuations around a part.
 */
const PADDING = /^(?:\s|\\\n)+|(?:\s|\\\n)+$/g;

interface IShellPart {
  code: string;
  /**
   * The files that the part writes with `>` or `>>`.
   */
  targets?: string[];
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
 * The word after the spaces at `start`, without its quotes, the index after
 * it, and the word as written.
 */
function readWord(text: string, start: number): [string, number, string] {
  WORD.lastIndex = start;
  const raw = WORD.exec(text)![1];
  return [raw.replace(/'([^']*)'|"([^"]*)"/g, '$1$2'), WORD.lastIndex, raw];
}

/**
 * The exit code of an `exit` command (null: the code of the command before),
 * or undefined for another command.
 */
function exitCode(code: string): number | null | undefined {
  const [name, after] = readWord(code, 0);
  if (name !== 'exit') {
    return undefined;
  }
  const [status] = readWord(code, after);
  if (!status) {
    return null;
  }
  return /^-?\d+$/.test(status) ? ((Number(status) % 256) + 256) % 256 : 2;
}

/**
 * The pipelines of a command line, each run on its own: cockle has no `#`
 * comments and echoes the lines of a multi-line command. A heredoc body stays
 * as written with its command. Throws for what cockle would run wrong, or
 * wait on until the timeout.
 */
function commandParts(code: string): IShellPart[] {
  if (KEYS.test(code)) {
    throw new Error(
      'cockle reads a TAB or a control character in a command as a key, so it cannot keep it. ' +
        'Use the write tool for files that contain tabs; sed and printf understand \\t, and cut splits on TAB by default.'
    );
  }
  const text = `${code.replace(/\r\n?/g, '\n')}\n`;
  const parts: IShellPart[] = [];
  const heredocs: { part: IShellPart; delimiter: string }[] = [];
  let part: IShellPart = { code: '' };
  let quoted = '';
  let piped = false;
  let input = false;
  const endCommand = () => {
    if (!piped && !input) {
      // A headless command that reads stdin would wait until the timeout.
      part.code = part.code.replace(/(?:\s|\\\n)*$/, ' < /dev/null$&');
    }
    piped = true;
  };
  const close = () => {
    if (part.code.trim()) {
      endCommand();
      part.code = part.code.replace(PADDING, '');
      if (part.code.endsWith('|')) {
        throw new Error('The command ends with |');
      }
      parts.push(part);
    }
    part = { code: '' };
    piped = input = false;
  };
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      quoted = char === quoted ? '' : quoted;
    } else if (char === "'" || char === '"') {
      quoted = char;
    } else if (char === '#' && /[\s;&|()<>]/.test(text[i - 1] ?? ' ')) {
      i = text.indexOf('\n', i) - 1;
      continue;
    } else if (char === '\n') {
      if (/(?:\\|\|\s*)$/.test(part.code)) {
        // A newline after `\` or `|` continues the command.
        if (heredocs.length) {
          throw new Error(
            'cockle runs a here document at the end of its line: put the rest of the pipeline on the line of the <<'
          );
        }
        part.code += char;
        continue;
      }
      close();
      for (const { part: target, delimiter } of heredocs.splice(0)) {
        const start = text.indexOf(`\n${delimiter}\n`, i);
        if (start < 0 || delimiter.includes('\n')) {
          throw new Error(`The here document has no ${delimiter} end line`);
        }
        const end = start + delimiter.length + 1;
        target.code += text.slice(i, end);
        if (NON_ASCII.test(target.code)) {
          throw new Error(
            'cockle corrupts text that is not ASCII in a here document. Write such files with the write or edit tool.'
          );
        }
        i = end;
      }
      continue;
    } else if (text.startsWith('&>', i)) {
      const append = text[i + 2] === '>';
      const [word, end] = readWord(text, i + (append ? 3 : 2));
      if (word !== '/dev/null') {
        throw new Error(
          'cockle has no &> redirect: use > FILE 2> FILE2, or > /dev/null 2> /dev/null'
        );
      }
      part.code += '> /dev/null 2> /dev/null';
      i = end - 1;
      continue;
    } else if (text.startsWith('&&', i) || text.startsWith('||', i)) {
      // cockle reads them as arguments of the command before.
      throw new Error(
        `cockle has no ${text.slice(i, i + 2)}: run the commands in separate calls`
      );
    } else if (char === ';' || char === '&') {
      close();
      continue;
    } else if (char === '|') {
      endCommand();
    } else if (char === '<' || char === '>') {
      const duplicate = /^&\d+/.exec(text.slice(i + 1));
      if (duplicate) {
        // stdout and stderr both go to the output: drop 2>&1 or >&2.
        part.code = part.code.replace(/\d+$/, '');
        i += duplicate[0].length;
        continue;
      }
      const [token] = /^(?:<<-|<+|>+)/.exec(text.slice(i))!;
      i += token.length - 1;
      const [word, end, raw] = readWord(text, i + 1);
      if (char === '<') {
        input ||= !piped;
      } else if (word && word !== '/dev/null') {
        (part.targets ??= []).push(word);
      }
      if (token === '<<' || token === '<<-') {
        if (!word) {
          throw new Error('cockle needs a here document delimiter word');
        }
        // cockle reads `<<'EOF'` as one word, not as a heredoc.
        part.code += `${token} ${raw}`;
        heredocs.push({ part, delimiter: word });
        i = end - 1;
      } else {
        // cockle reads `>'f'` as one word, not as a redirect.
        part.code += /\s/.test(text[i + 1]) ? token : `${token} `;
      }
      continue;
    }
    part.code += char;
  }
  if (quoted) {
    throw new Error(
      `The command has no closing ${quoted} quote (cockle has no \\ escapes)`
    );
  }
  close();
  return parts;
}

/**
 * The output without the echo of a command that cockle reads over several
 * lines (heredoc, quote, `\` or `|` continuation): the exec plugin removes
 * the echo of one line only, and cockle shows the next lines after a `> `.
 */
function withoutEcho(output: string, code: string): string {
  const lines = code.trim().split('\n');
  const echo = `${lines.join('\n> ')}\n`;
  return lines.length > 1 && output.startsWith(echo)
    ? output.slice(echo.length)
    : output;
}

/**
 * Settle with the promise, or reject with `message` (`aborted` by default)
 * when the signal aborts first.
 */
export function abortable<T>(
  promise: Promise<T>,
  signal: AbortSignal | undefined,
  onAbort: () => void,
  message = 'aborted'
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const abort = () => {
      onAbort();
      reject(new Error(message));
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
  /**
   * `files` reads and writes the drive, to repair the files that commands
   * write with `>`.
   */
  constructor(commands: CommandRegistry, files: DriveOperations) {
    this._commands = commands;
    this._files = files;
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
    const run = async () => {
      const parts = commandParts(code);
      signal?.throwIfAborted();
      shellName = await this.start();
      signal?.throwIfAborted();
      const moved = await this._run(
        shellName,
        `cd ${quote(cwd)}`,
        CD_TIMEOUT_MS
      );
      signal?.throwIfAborted();
      if (!moved.success) {
        throw new Error(
          `Cannot change to the working directory ${cwd}: ${moved.output.trim() || moved.message}`
        );
      }
      const deadline = Date.now() + timeoutMs;
      let output = '';
      let last = moved;
      for (const part of parts) {
        const exit = exitCode(part.code);
        if (exit !== undefined) {
          // cockle's exit stops the shell: the command would never finish.
          last = { ...last, exitCode: exit ?? last.exitCode };
          break;
        }
        signal?.throwIfAborted();
        last = await this._run(
          shellName,
          part.code,
          Math.max(1, deadline - Date.now())
        );
        output += withoutEcho(last.output, part.code);
        if (last.status === 'timeout') {
          break;
        }
        for (const target of part.targets ?? []) {
          await this._repair(path.posix.resolve(cwd, target));
        }
      }
      return { ...last, output };
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
   * Decode the text that is not ASCII of a drive file written by cockle.
   */
  private async _repair(file: string): Promise<void> {
    if (toContentsPath(file) === null) {
      return;
    }
    try {
      const text = (await this._files.readFile(file)).toString('utf8');
      const repaired = text.replace(BYTE_RUNS, run =>
        new TextDecoder().decode(
          Uint8Array.from(run, char => char.charCodeAt(0) & 0xff)
        )
      );
      if (repaired !== text) {
        await this._files.writeFile(file, repaired);
      }
    } catch {
      // The command did not write the file.
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
  private _files: DriveOperations;
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
