import type { ImageContent } from '@earendil-works/pi-ai';
import {
  ExtensionSelectorComponent,
  initTheme,
  InteractiveMode,
  parseArgs,
  SessionManager,
  VERSION,
  type AgentSessionRuntime,
  type Args,
  type ProjectTrustContext
} from '@earendil-works/pi-coding-agent';
import {
  StdinBuffer,
  TuiMainScreen,
  type Terminal
} from '@earendil-works/pi-tui';
import { Termios, type IExternalRunContext } from '@jupyterlite/cockle';
import fs from 'fs';
import { resolveToCwd } from 'pi-coding-agent-package/dist/core/tools/path-utils.js';
import path from 'path';

import type { DriveOperations } from './drive';
import { terminalApproval } from './extension';
import type { IRuntimeOptions, PiHost } from './host';
import { DRIVE, isAgentPath, toContentsPath, volume } from './vfs';

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

const USAGE = `Usage: pi [options] [@files...] [messages...]

Run the pi coding agent in this terminal.

Options:
  -c, --continue        Continue the most recent session of this directory
  -r, --resume          Select a session to resume
  --session <path|id>   Use a session file, or the session with this ID
  --no-session          Do not save the session
  -n, --name <name>     Set the session name
  --model <pattern>     Model pattern or ID, with an optional ":<thinking>"
  --provider <name>     Provider to search for --model
  --thinking <level>    Thinking level, from off to max
  --tui-mode <mode>     TUI mode: fullscreen (default) or regular
  --verbose             Show all the startup information
  --                    End of the options: the next arguments are messages
  -h, --help            Show this help
  -v, --version         Show the version

pi sends the messages one after the other. @file puts the content of a file
in the first message.
`;

/**
 * The options of pi that work in the browser, by their parsed name.
 */
const BROWSER_OPTIONS = new Set([
  'continue',
  'resume',
  'session',
  'noSession',
  'name',
  'model',
  'provider',
  'thinking',
  'tuiMode',
  'verbose',
  'offline',
  'help',
  'version',
  'messages',
  'fileArgs',
  'unknownFlags',
  'diagnostics'
]);

const TERMINAL_INSTRUCTIONS =
  'You run in pi, the coding agent, inside a JupyterLite terminal. Answers are rendered as markdown in the terminal: rich MIME outputs and images are not displayed.';

type ProcessShim = typeof process & {
  ProcessExit: new (code: number) => Error & { code: number };
};

const processShim = process as ProcessShim;

/**
 * The project trust question in the terminal, as pi asks it before its
 * interactive mode starts.
 */
function terminalTrustContext(
  terminal: CockleTerminal,
  cwd: string,
  signal?: AbortSignal
): ProjectTrustContext {
  const select = (title: string, options: string[]) =>
    new Promise<string | undefined>((resolve, reject) => {
      // A closed terminal does not answer: its run fails and nothing is kept.
      if (signal?.aborted) {
        reject(new Error('The terminal is closed'));
        return;
      }
      const ui = new TuiMainScreen(terminal);
      let done = false;
      const finish = (settle: () => void) => {
        if (done) {
          return;
        }
        done = true;
        signal?.removeEventListener('abort', cancel);
        ui.clear();
        ui.requestRender();
        window.setTimeout(() => {
          ui.stop();
          settle();
        }, 25);
      };
      const cancel = () =>
        finish(() => reject(new Error('The terminal is closed')));
      signal?.addEventListener('abort', cancel, { once: true });
      const selector = new ExtensionSelectorComponent(
        title,
        options,
        option => finish(() => resolve(option)),
        () => finish(() => resolve(undefined)),
        { tui: ui }
      );
      ui.addChild(selector);
      ui.setFocus(selector);
      ui.start();
    });
  return {
    cwd,
    mode: 'tui',
    hasUI: true,
    ui: {
      select,
      confirm: async (title, message) =>
        (await select(`${title}\n${message}`, ['Yes', 'No'])) === 'Yes',
      input: async () => undefined,
      notify: () => undefined
    }
  };
}

/**
 * pi-tui terminal over a cockle external command context.
 */
class CockleTerminal implements Terminal {
  /**
   * `cwd` is the directory where pi started. The page has one process cwd
   * for all the terminals: each input sets it, because pi resolves the paths
   * of commands such as `/export` against it.
   */
  constructor(context: IExternalRunContext, cwd: string) {
    this._context = context;
    this._cwd = cwd;
  }

  start(onInput: (data: string) => void, onResize: () => void): void {
    if (this._halted) {
      return;
    }
    this._enterRawMode();
    this._running = true;
    this._size = this._readSize();
    const input = (data: string) => {
      if (this._running) {
        processShim.chdir(this._cwd);
        onInput(data);
      }
    };
    const buffer = new StdinBuffer({ escapeTimeout: ESCAPE_TIMEOUT_MS });
    buffer.on('data', input);
    buffer.on('paste', (content: string) =>
      input(`\x1b[200~${content}\x1b[201~`)
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
      const light = document.body.dataset.jpThemeLight !== 'false';
      input(COLOR_SCHEME_REPORTS[light ? 'light' : 'dark']);
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

  setProgramStatus(): void {
    // xterm.js does not support the program status protocol.
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
  private _cwd: string;
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
  const args = parseArgs(context.args);
  const errors = argumentErrors(context.args, args);
  if (errors.length) {
    for (const error of errors) {
      context.stderr.write(`pi: ${error}\r\n`);
    }
    return 1;
  }
  if (args.version) {
    context.stdout.write(`${VERSION}\r\n`);
    return 0;
  }
  if (args.help) {
    context.stdout.write(USAGE.replace(/\n/g, '\r\n'));
    return 0;
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

  const files = await readFileArgs(args.fileArgs, cwd);
  const sessionManager = await openSession(args, cwd);
  if (args.name !== undefined) {
    sessionManager.appendSessionInfo(args.name.trim());
  }
  const [message, ...messages] = args.messages;
  const shell = host.createShell();

  const terminal = new CockleTerminal(context, cwd);
  let runtime: AgentSessionRuntime | undefined;
  let exit: IExit = { code: 1, disposed: false };
  try {
    // pi's theme for the trust question, before the settings of the session.
    initTheme(undefined, false);
    // pi runs a --session file in the folder of the session. A missing folder
    // stays pi's error: createRuntime would create it.
    const sessionCwd = sessionManager.getCwd();
    const options: IRuntimeOptions = {
      cwd: fs.existsSync(sessionCwd) ? sessionCwd : cwd,
      sessionManager,
      approve: terminalApproval,
      instructions: TERMINAL_INSTRUCTIONS,
      shell,
      args,
      trustContext: terminalTrustContext(terminal, cwd, signal)
    };
    runtime = await host.createRuntime(options);
    // Once pi's interface runs, a second one cannot take the terminal.
    delete options.trustContext;
    // pi stops before its interface on an error, for example a --model that
    // it cannot find.
    const errors = runtime.diagnostics.filter(({ type }) => type === 'error');
    if (errors.length) {
      for (const { message } of errors) {
        context.stderr.write(`pi: ${message}\r\n`);
      }
      return 1;
    }
    const importFromJsonl = runtime.importFromJsonl.bind(runtime);
    runtime.importFromJsonl = async (inputPath, cwdOverride) => {
      const file = resolveToCwd(inputPath, cwd);
      // pi reports a file that it cannot read.
      await loadDriveFile(file).catch(() => undefined);
      return importFromJsonl(file, cwdOverride);
    };
    initTheme(runtime.services.settingsManager.getTheme(), false);
    const mode = new InteractiveMode(runtime, {
      terminal,
      startupDiagnostics: [...args.diagnostics, ...runtime.diagnostics],
      modelFallbackMessage: runtime.modelFallbackMessage,
      initialMessage: `${files.text}${message ?? ''}`,
      initialImages: files.images,
      initialMessages: messages,
      verbose: args.verbose,
      tuiMode: args.tuiMode
    });
    exit = await runUntilExit(
      mode,
      signal,
      args.resume && !args.session && !args.noSession
    );
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

/**
 * The errors of the command line: pi's own, and the options that do not work
 * in the browser.
 */
function argumentErrors(argv: string[], args: Args): string[] {
  const errors = args.diagnostics
    .filter(diagnostic => diagnostic.type === 'error')
    .map(diagnostic => diagnostic.message);
  for (const key of Object.keys(args)) {
    if (!BROWSER_OPTIONS.has(key)) {
      // The argument that sets this option, as typed.
      const option = argv.find(
        (arg, index) =>
          arg.startsWith('-') && key in parseArgs(argv.slice(index, index + 2))
      );
      errors.push(`${option ?? key} is not available in the browser`);
    }
  }
  for (const name of args.unknownFlags.keys()) {
    errors.push(`Unknown option: --${name}`);
  }
  if (args.provider && !args.model) {
    errors.push('--provider requires --model');
  }
  if (args.name !== undefined && !args.name.trim()) {
    errors.push('--name requires a non-empty value');
  }
  if (
    args.resume &&
    (args.messages.length || args.fileArgs.length || args.name !== undefined)
  ) {
    errors.push('--resume does not take messages or --name in the browser');
  }
  return errors;
}

/**
 * The session of the command line, in the order of pi. With `--resume`, pi
 * starts in a new session and shows its session selector.
 */
async function openSession(args: Args, cwd: string): Promise<SessionManager> {
  if (args.noSession) {
    return SessionManager.inMemory(cwd);
  }
  if (args.session) {
    return SessionManager.open(await findSession(args.session, cwd));
  }
  return args.continue && !args.resume
    ? SessionManager.continueRecent(cwd)
    : SessionManager.create(cwd);
}

/**
 * The file of a `--session` argument: a path, or the ID (or the start of the
 * ID) of a session of the directory.
 */
async function findSession(session: string, cwd: string): Promise<string> {
  if (session.includes('/') || session.endsWith('.jsonl')) {
    const file = resolveToCwd(session, cwd);
    await loadDriveFile(file);
    return file;
  }
  const file =
    SessionManager.findById(cwd, session) ??
    (await SessionManager.list(cwd)).find(info => info.id.startsWith(session))
      ?.path;
  if (!file) {
    throw new Error(`No session found matching '${session}'`);
  }
  return file;
}

/**
 * The text and images of the `@file` arguments, which pi puts in the first
 * message.
 */
async function readFileArgs(
  fileArgs: string[],
  cwd: string
): Promise<{ text: string; images: ImageContent[] }> {
  const { drive } = fs as unknown as { drive: DriveOperations };
  let text = '';
  const images: ImageContent[] = [];
  for (const fileArg of fileArgs) {
    const file = resolveToCwd(fileArg, cwd);
    const data = await drive.readFile(file);
    if (!data.length) {
      continue;
    }
    const mimeType = await drive.detectImageMimeType(file);
    if (mimeType) {
      images.push({ type: 'image', mimeType, data: data.toString('base64') });
      text += `<file name="${file}"></file>\n`;
    } else {
      const content = data.toString('utf-8').replace(/^\uFEFF/, '');
      text += `<file name="${file}">\n${content}\n</file>\n`;
    }
  }
  return { text, images };
}

/**
 * Copy a session file of the drive into memfs, where pi opens it, with the
 * folder of the session, which pi checks. A missing file is not an error:
 * pi starts a new session at its path. The agent folder is already in memfs.
 */
async function loadDriveFile(file: string): Promise<void> {
  if (toContentsPath(file) === null || isAgentPath(file)) {
    return;
  }
  const { drive } = fs as unknown as { drive: DriveOperations };
  let data: Buffer;
  try {
    data = await drive.readFile(file);
  } catch (error) {
    if ((error as { code?: string }).code === 'ENOENT') {
      return;
    }
    throw error;
  }
  volume.mkdirSync(path.posix.dirname(file), { recursive: true });
  volume.writeFileSync(file, data);
  try {
    const { cwd } = JSON.parse(data.toString('utf-8').split('\n', 1)[0]);
    if (
      typeof cwd === 'string' &&
      toContentsPath(cwd) !== null &&
      (await drive.stat(cwd)).isDirectory()
    ) {
      volume.mkdirSync(cwd, { recursive: true });
    }
  } catch {
    // pi reports a session file without a valid header.
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
  signal?: AbortSignal,
  resume = false
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
    const run = async () => {
      if (resume) {
        // run() does not initialize the mode again.
        await mode.init();
        (
          mode as unknown as { showSessionSelector(): void }
        ).showSessionSelector();
      }
      await mode.run();
    };
    run().catch(error => settle(error, 'run'));
  });
}
