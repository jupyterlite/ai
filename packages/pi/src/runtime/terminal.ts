import {
  initTheme,
  InteractiveMode,
  SessionManager,
  type AgentSessionRuntime
} from '@earendil-works/pi-coding-agent';
import { StdinBuffer, type Terminal } from '@earendil-works/pi-tui';
import { Termios, type IExternalRunContext } from '@jupyterlite/cockle';

import { terminalApproval } from './extension';
import type { PiHost } from './host';
import { DRIVE } from './vfs';

const { ICRNL, INLCR, IGNCR, IXON } = Termios.InputFlag;
const { ECHO, ECHONL, ICANON, ISIG, IEXTEN } = Termios.LocalFlag;

const RESIZE_POLL_MS = 250;
const HANGUP_EXIT_CODE = 129;
/**
 * Cockle hands over input in polled chunks: give a lone ESC more time than a
 * local terminal before it counts as the Escape key.
 */
const ESCAPE_TIMEOUT_MS = 50;

/**
 * Color scheme reports of DEC mode 2031, which xterm.js does not send: pi
 * then queries the terminal colors again.
 */
const COLOR_SCHEME_REPORTS = { dark: '\x1b[?997;1n', light: '\x1b[?997;2n' };

const USAGE = `Usage: pi [options] [message...]

Run the pi coding agent in this terminal.

Options:
  -c, --continue   Continue the most recent session of this directory
  -h, --help       Show this help
`;

const TERMINAL_INSTRUCTIONS =
  'You run in pi, the coding agent, inside a JupyterLite terminal. Answers are rendered as markdown in the terminal: rich MIME outputs and images are not displayed.';

type ProcessShim = typeof process & {
  ProcessExit: new (code: number) => Error & { code: number };
};

const processShim = process as ProcessShim;

/**
 * pi-tui terminal over a cockle external command context.
 */
class CockleTerminal implements Terminal {
  constructor(context: IExternalRunContext) {
    this._context = context;
  }

  start(onInput: (data: string) => void, onResize: () => void): void {
    if (this._halted) {
      return;
    }
    this._enterRawMode();
    this._running = true;
    this._size = this._readSize();
    const buffer = new StdinBuffer({ escapeTimeout: ESCAPE_TIMEOUT_MS });
    buffer.on('data', (sequence: string) => this._running && onInput(sequence));
    buffer.on(
      'paste',
      (content: string) =>
        this._running && onInput(`\x1b[200~${content}\x1b[201~`)
    );
    this._buffer = buffer;
    this._resizeTimer = window.setInterval(() => {
      const size = this._readSize();
      if (
        size.rows !== this._size.rows ||
        size.columns !== this._size.columns
      ) {
        this._size = size;
        onResize();
      }
    }, RESIZE_POLL_MS);
    this._themeObserver = new MutationObserver(() => {
      if (this._running) {
        const light = document.body.dataset.jpThemeLight !== 'false';
        onInput(COLOR_SCHEME_REPORTS[light ? 'light' : 'dark']);
      }
    });
    this._themeObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ['data-jp-theme-name', 'data-term-theme'],
      subtree: true
    });
    this.write('\x1b[?2004h');
    for (const chunk of this._pending.splice(0)) {
      buffer.process(chunk);
    }
    this._loop ??= this._readLoop();
  }

  /**
   * pi stops and starts the terminal again for mode switches: the read loop
   * goes on, so cockle never sees two stdin requests at once.
   */
  stop(): void {
    this._running = false;
    window.clearInterval(this._resizeTimer);
    this._themeObserver?.disconnect();
    this._themeObserver = undefined;
    this._buffer?.destroy();
    this._buffer = undefined;
    this.write('\x1b[?2004l');
    this._restoreMode();
  }

  /**
   * pi calls this on its way out: stop reading so that no stdin request is
   * left pending when the command returns.
   */
  async drainInput(): Promise<void> {
    this.halt();
  }

  write(data: string): void {
    this._context.stdout.write(data);
  }

  get columns(): number {
    return this._size.columns;
  }

  get rows(): number {
    return this._size.rows;
  }

  get kittyProtocolActive(): boolean {
    return false;
  }

  moveBy(lines: number): void {
    if (lines > 0) {
      this.write(`\x1b[${lines}B`);
    } else if (lines < 0) {
      this.write(`\x1b[${-lines}A`);
    }
  }

  hideCursor(): void {
    this.write('\x1b[?25l');
  }

  showCursor(): void {
    this.write('\x1b[?25h');
  }

  clearLine(): void {
    this.write('\x1b[K');
  }

  clearFromCursor(): void {
    this.write('\x1b[J');
  }

  clearScreen(): void {
    this.write('\x1b[2J\x1b[H');
  }

  setTitle(): void {
    // The terminal tab keeps its title.
  }

  setProgress(): void {
    // No progress indicator in xterm.js.
  }

  /**
   * Stop reading stdin and do not start again.
   */
  halt(): void {
    this._halted = true;
  }

  /**
   * Stop reading stdin, also when pi never started. Cockle cannot cancel a
   * read in progress, so ask for a key and wait for it: a stdin request left
   * open would take the input of the next command. The wait ends when the
   * terminal is gone.
   */
  async close(signal?: AbortSignal): Promise<void> {
    this.halt();
    if (!this._reading || signal?.aborted) {
      return;
    }
    this._enterRawMode();
    this.write('\r\nPress any key to return to the shell.');
    await new Promise<void>(resolve => {
      signal?.addEventListener('abort', () => resolve(), { once: true });
      void this._loop?.then(resolve);
    });
    this._restoreMode();
    this.write('\r\n');
  }

  private _readSize(): { rows: number; columns: number } {
    const { rows, columns } = this._context.size();
    return { rows: rows || 24, columns: columns || 80 };
  }

  private async _readLoop(): Promise<void> {
    try {
      while (!this._halted) {
        this._reading = true;
        const chunk = await this._context.stdin.readAsync(null);
        this._reading = false;
        if (!this._running) {
          this._pending.push(chunk);
          return;
        }
        this._buffer?.process(chunk);
        // A window opened in the task of the next read (a sign-in) makes
        // cockle lose that read.
        await new Promise(resolve => window.setTimeout(resolve));
      }
    } catch (error) {
      console.warn('pi: cannot read the terminal input', error);
    } finally {
      this._reading = false;
      this._loop = undefined;
    }
  }

  private _enterRawMode(): void {
    const { termios } = this._context;
    if (!this._saved) {
      this._saved = Termios.cloneFlags(termios.get());
    }
    const flags = Termios.cloneFlags(this._saved);
    flags.c_iflag &= ~(ICRNL | INLCR | IGNCR | IXON);
    flags.c_lflag &= ~(ECHO | ECHONL | ICANON | ISIG | IEXTEN);
    termios.set(flags);
  }

  private _restoreMode(): void {
    if (this._saved) {
      this._context.termios.set(this._saved);
      this._saved = undefined;
    }
  }

  private _context: IExternalRunContext;
  private _buffer?: StdinBuffer;
  private _saved?: Termios.IFlags;
  private _size = { rows: 24, columns: 80 };
  private _resizeTimer?: number;
  private _themeObserver?: MutationObserver;
  private _running = false;
  private _halted = false;
  private _reading = false;
  private _loop?: Promise<void>;
  private _pending: string[] = [];
}

/**
 * Run pi's interactive mode for one invocation of the `pi` command. Resolves
 * with the exit code that pi passes to `process.exit` and rejects when pi
 * fails. The signal aborts when the terminal session is shut down.
 */
export async function runTerminal(
  host: PiHost,
  context: IExternalRunContext,
  signal?: AbortSignal
): Promise<number> {
  const flags = context.args.filter(arg => arg.startsWith('-'));
  const words = context.args.filter(arg => !arg.startsWith('-'));
  if (flags.some(flag => flag === '-h' || flag === '--help')) {
    context.stdout.write(USAGE.replace(/\n/g, '\r\n'));
    return 0;
  }
  const unknown = flags.find(flag => !['-c', '--continue'].includes(flag));
  if (unknown) {
    context.stderr.write(`pi: unknown option ${unknown}\r\n`);
    return 2;
  }
  if (context.shellId.startsWith('headless-')) {
    context.stderr.write('pi: cannot run in a headless shell\r\n');
    return 1;
  }
  if (!context.stdin.isTerminal() || !context.stdout.isTerminal()) {
    context.stderr.write('pi: stdin and stdout must be a terminal\r\n');
    return 1;
  }

  const cwd = context.environment.get('PWD') || DRIVE;
  if (cwd !== DRIVE && !cwd.startsWith(`${DRIVE}/`)) {
    context.stderr.write(`pi: run pi in ${DRIVE} or one of its folders\r\n`);
    return 1;
  }
  processShim.chdir(cwd);

  const shell = host.createShell();

  const terminal = new CockleTerminal(context);
  let runtime: AgentSessionRuntime | undefined;
  let exit: IExit = { code: 1, disposed: false };
  try {
    runtime = await host.createRuntime({
      cwd,
      sessionManager: flags.some(flag => flag === '-c' || flag === '--continue')
        ? SessionManager.continueRecent(cwd)
        : SessionManager.create(cwd),
      approve: terminalApproval,
      instructions: TERMINAL_INSTRUCTIONS,
      shell
    });
    initTheme(runtime.services.settingsManager.getTheme(), false);
    const mode = new InteractiveMode(runtime, {
      terminal,
      startupDiagnostics: [...runtime.diagnostics],
      modelFallbackMessage: runtime.modelFallbackMessage,
      initialMessage: words.join(' ')
    });
    exit = await runUntilExit(mode, signal);
    return exit.code;
  } finally {
    terminal.halt();
    if (runtime && !exit.disposed) {
      try {
        await runtime.dispose();
      } catch (error) {
        console.warn('pi: cannot dispose the session', error);
      }
    }
    await shell?.dispose();
    await terminal.close(signal);
  }
}

interface IExit {
  code: number;
  /**
   * Whether pi disposed the runtime on its way out.
   */
  disposed: boolean;
}

function stopMode(mode: InteractiveMode): void {
  try {
    mode.stop();
  } catch {
    // The terminal may already be stopped.
  }
}

/**
 * pi leaves its interactive mode through `process.exit`, which the process
 * shim turns into a `ProcessExit` error. Only `shutdown` disposes the
 * runtime.
 */
function runUntilExit(
  mode: InteractiveMode,
  signal?: AbortSignal
): Promise<IExit> {
  return new Promise<IExit>((resolve, reject) => {
    let done = false;
    const settle = (error: unknown, name: string) => {
      if (done) {
        return;
      }
      done = true;
      signal?.removeEventListener('abort', hangup);
      if (error instanceof processShim.ProcessExit) {
        resolve({ code: error.code, disposed: name === 'shutdown' });
        return;
      }
      stopMode(mode);
      reject(error);
    };
    const hangup = () => {
      stopMode(mode);
      settle(new processShim.ProcessExit(HANGUP_EXIT_CODE), 'hangup');
    };

    const target = mode as unknown as Record<
      string,
      (...args: unknown[]) => Promise<unknown>
    >;
    for (const name of ['shutdown', 'handleFatalRuntimeError']) {
      const original = target[name];
      target[name] = async function (this: unknown, ...args: unknown[]) {
        try {
          return await original.apply(this, args);
        } catch (error) {
          settle(error, name);
        }
      };
    }
    if (signal?.aborted) {
      hangup();
      return;
    }
    signal?.addEventListener('abort', hangup, { once: true });
    mode.run().catch(error => settle(error, 'run'));
  });
}
