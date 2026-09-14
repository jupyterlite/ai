import type { JupyterFrontEnd } from '@jupyterlab/application';
import type { IExternalRunContext } from '@jupyterlite/cockle';
import {
  type IAgentManager,
  type IAgentManagerFactory,
  type IAISettingsModel,
  type IProviderRegistry,
  type IToolRegistry,
  ToolRegistry
} from '@jupyternaut/agent';

import { TerminalApp } from './app';
import { createTerminalTools, DRIVE_MOUNTPOINT, ShellRunner } from './tools';
import { Tty } from './tty';

const OPEN_SETTINGS_COMMAND = '@jupyternaut/persona:open-settings';

export interface ISessionOptions {
  app: JupyterFrontEnd;
  agentFactory: IAgentManagerFactory;
  settingsModel: IAISettingsModel;
  providerRegistry?: IProviderRegistry;
  toolRegistry?: IToolRegistry;
  isDarkMode: () => boolean;
}

function terminalInstructions(cwd: string): string {
  return `TERMINAL SESSION:
You are running as the \`jupyternaut\` command inside a terminal of JupyterLite, an in-browser shell called cockle. Everything runs in the browser: there is no server, no Python or Node in the shell, and no network access except through the tools that provide it.
- The working directory is ${cwd}. The JupyterLite files are mounted at ${DRIVE_MOUNTPOINT}; paths outside it are internal to the shell.
- Use the terminal tools first: \`shell\` to run commands, \`list_files\`, \`read_file\`, \`write_file\` and \`edit_file\` for files. Use absolute paths under ${DRIVE_MOUNTPOINT} or paths relative to the working directory.
- The JupyterLab commands (\`discover_commands\` then \`execute_command\`) are still available, for example to open a file in the editor or to run code in a kernel.
- Your answers are rendered as markdown in the terminal: keep them concise, use fenced code blocks for code, and do not rely on rich (MIME) outputs, images or notebook rendering.`;
}

/**
 * State kept for one terminal across invocations of the command: the agent
 * (and its history), the headless shell and the approved tools.
 */
export class TerminalSession {
  constructor(shellId: string, cwd: string, options: ISessionOptions) {
    this.shellId = shellId;
    this.initialCwd = cwd;
    this._cwd = cwd;
    this._options = options;
    this.shell = new ShellRunner(options.app.commands, cwd);
    this.tools = new ToolRegistry();
    this.syncTools();
    this.agent = options.agentFactory.createAgent({
      settingsModel: options.settingsModel,
      providerRegistry: options.providerRegistry,
      toolRegistry: this.tools,
      additionalInstructions: terminalInstructions(cwd)
    });
  }

  readonly shellId: string;
  readonly initialCwd: string;
  readonly agent: IAgentManager;
  readonly shell: ShellRunner;
  readonly tools: ToolRegistry;
  /**
   * Tools the user allowed for the rest of the session.
   */
  readonly allowedTools = new Set<string>();

  get cwd(): string {
    return this._cwd;
  }

  async setCwd(cwd: string): Promise<void> {
    this._cwd = cwd;
    await this.shell.setCwd(cwd);
  }

  /**
   * Refresh the agent tools from the shared registry plus the terminal tools.
   */
  syncTools(): void {
    for (const name of Object.keys(this.tools.tools)) {
      this.tools.remove(name);
    }
    const shared = this._options.toolRegistry?.tools ?? {};
    for (const [name, tool] of Object.entries(shared)) {
      this.tools.add(name, tool);
    }
    const terminalTools = createTerminalTools({
      contents: this._options.app.serviceManager.contents,
      shell: this.shell,
      cwd: () => this._cwd,
      needsApproval: name => !this.allowedTools.has(name)
    });
    for (const [name, tool] of Object.entries(terminalTools)) {
      this.tools.add(name, tool);
    }
  }

  dispose(): void {
    this.agent.stopStreaming();
    void this.shell.dispose();
  }

  private _cwd: string;
  private _options: ISessionOptions;
}

/**
 * Maps terminals (cockle shell ids) to their sessions and runs the command.
 */
export class TerminalSessionManager {
  constructor(options: ISessionOptions) {
    this._options = options;
  }

  async run(context: IExternalRunContext): Promise<number> {
    const cwd = context.environment.get('PWD') ?? DRIVE_MOUNTPOINT;
    let session = this._sessions.get(context.shellId);
    if (session) {
      await session.setCwd(cwd);
      session.syncTools();
      session.agent.setSelectedTools(Object.keys(session.tools.tools));
    } else {
      session = new TerminalSession(context.shellId, cwd, this._options);
      this._sessions.set(context.shellId, session);
    }
    try {
      await session.shell.start();
    } catch (error) {
      console.warn('Jupyternaut: cannot start the headless shell', error);
    }
    const { app, settingsModel, providerRegistry, isDarkMode } = this._options;
    const terminalApp = new TerminalApp({
      tty: new Tty(context),
      session,
      settingsModel,
      providerRegistry,
      isDarkMode,
      openSettings: () => app.commands.execute(OPEN_SETTINGS_COMMAND)
    });
    return terminalApp.run();
  }

  dispose(shellId: string): void {
    const session = this._sessions.get(shellId);
    if (session) {
      this._sessions.delete(shellId);
      session.dispose();
    }
  }

  private _options: ISessionOptions;
  private _sessions = new Map<string, TerminalSession>();
}
