import {
  createAgentSessionFromServices,
  createAgentSessionRuntime,
  createAgentSessionServices,
  createEditToolDefinition,
  createLsToolDefinition,
  createMcpExtension,
  createReadToolDefinition,
  createWriteToolDefinition,
  type AgentSessionRuntime,
  type CreateAgentSessionRuntimeFactory,
  type McpServerConfig,
  type SessionManager,
  type ToolDefinition
} from '@earendil-works/pi-coding-agent';
import { StreamableHttpTransport } from '@earendil-works/pi-mcp';
import type { JupyterFrontEnd } from '@jupyterlab/application';
import type { IDocumentManager } from '@jupyterlab/docmanager';
import type { ITranslator } from '@jupyterlab/translation';
import type { IAISettingsModel, IToolRegistry } from '@jupyternaut/agent';
import fs from 'fs';
import { Signal, type ISignal } from '@lumino/signaling';
import type { IMcpManager } from 'jupyter-mcp-manager';
import path from 'path';
import { collectSettingsDiagnostics } from 'pi-coding-agent-package/dist/core/settings-diagnostics.js';

import { createFindTool, createGrepTool, DriveOperations } from './drive';
import {
  JUPYTER_INSTRUCTIONS,
  jupyterExtension,
  type ApprovalHandler
} from './extension';
import { adaptProviders } from './providers';
import { createCockleBashTool, hasCockleShell, ShellRunner } from './shell';
import {
  AGENT_DIR,
  DRIVE,
  DriveMirror,
  onRemoteChange,
  restoreAgentDir
} from './vfs';

/**
 * Files of the agent folder that change the available models.
 */
const CONFIG_FILES = new Set(['auth.json', 'models.json', 'settings.json']);
/**
 * Outside the agent folder: the folder is saved in IndexedDB.
 */
const MCP_LOG = '/tmp/pi-mcp.log';
const EXECUTE_IN_KERNEL = 'jupyterlab-ai-commands:execute-in-kernel';

export interface IRuntimeOptions {
  cwd: string;
  sessionManager: SessionManager;
  approve: ApprovalHandler;
  /**
   * Instructions added for this front-end (terminal or chat).
   */
  instructions?: string;
  shell?: ShellRunner;
}

/**
 * Creates pi agent sessions for the chat and the terminal of the page, with
 * the same tools, extension, settings and credentials.
 */
export class PiHost {
  constructor(options: PiHost.IOptions) {
    const { contents } = options.app.serviceManager;
    this._options = options;
    this._mirror = new DriveMirror(contents);
    this._operations = new DriveOperations(contents, contentsPath =>
      this._revert(contentsPath)
    );
    (fs as unknown as { drive: DriveOperations }).drive = this._operations;
    this.ready = restoreAgentDir();
    onRemoteChange(files => {
      if (files.some(file => CONFIG_FILES.has(path.posix.basename(file)))) {
        this._configChanged.emit();
      }
    });
  }

  readonly ready: Promise<void>;

  /**
   * Emitted when another tab changes the credentials or models of pi.
   */
  get configChanged(): ISignal<this, void> {
    return this._configChanged;
  }

  /**
   * The Jupyternaut settings: approvals, skill folders, MIME rendering.
   */
  get settingsModel(): IAISettingsModel | undefined {
    return this._options.settingsModel;
  }

  get documentManager(): IDocumentManager | undefined {
    return this._options.documentManager;
  }

  get toolRegistry(): IToolRegistry | undefined {
    return this._options.toolRegistry;
  }

  /**
   * Its HTTP servers go to pi's MCP extension.
   */
  get mcpManager(): IMcpManager | undefined {
    return this._options.mcpManager;
  }

  /**
   * A shell for the bash tool, when JupyterLite terminals are available.
   */
  createShell(): ShellRunner | undefined {
    const { commands } = this._options.app;
    return hasCockleShell(commands) ? new ShellRunner(commands) : undefined;
  }

  /**
   * Create a session runtime; `newSession`, `/resume` and `/fork` rebuild
   * the session with the same options.
   */
  async createRuntime(options: IRuntimeOptions): Promise<AgentSessionRuntime> {
    // pi checks that the working directory of a session exists.
    fs.mkdirSync(options.cwd, { recursive: true });
    return createAgentSessionRuntime(this._factory(options), {
      cwd: options.cwd,
      agentDir: AGENT_DIR,
      sessionManager: options.sessionManager
    });
  }

  /**
   * Interrupt the kernel of a stopped `execute-in-kernel` call, unless a
   * notebook or a console uses the kernel: it can run the code of the user.
   */
  async interrupt(
    commandId: string,
    args: Record<string, unknown>
  ): Promise<void> {
    const { kernelId } = args;
    if (commandId !== EXECUTE_IN_KERNEL || typeof kernelId !== 'string') {
      return;
    }
    const { kernels, sessions } = this._options.app.serviceManager;
    const model = await kernels.findById(kernelId);
    if (
      !model ||
      [...sessions.running()].some(session => session.kernel?.id === kernelId)
    ) {
      return;
    }
    const kernel = kernels.connectTo({ model });
    try {
      await kernel.interrupt();
    } catch (error) {
      console.warn('pi: cannot interrupt the kernel', error);
    } finally {
      kernel.dispose();
    }
  }

  /**
   * Reload the open documents without unsaved changes whose file changed,
   * for example through a shell command.
   */
  async revertChanged(): Promise<void> {
    const { app, documentManager } = this._options;
    if (!documentManager) {
      return;
    }
    const contexts = new Set(
      [...app.shell.widgets('main')]
        .map(widget => documentManager.contextForWidget(widget))
        .filter(context => context !== undefined)
    );
    for (const context of contexts) {
      try {
        const model = await app.serviceManager.contents.get(context.path, {
          content: false
        });
        if (
          !context.model.dirty &&
          model.last_modified !== context.contentsModel?.last_modified
        ) {
          await context.revert();
        }
      } catch {
        // The file may be gone.
      }
    }
  }

  private _factory(options: IRuntimeOptions): CreateAgentSessionRuntimeFactory {
    return async ({ cwd, agentDir, sessionManager, sessionStartEvent }) => {
      const skillFolders = this._skillFolders();
      await this._mirror.sync(cwd, skillFolders);
      const services = await createAgentSessionServices({
        cwd,
        agentDir,
        resourceLoaderOptions: {
          extensionFactories: [
            {
              // Inline, not built-in: settings cannot turn off the approvals.
              name: 'jupyter',
              hidden: true,
              factory: jupyterExtension({
                host: this,
                shell: options.shell,
                approve: options.approve,
                onReload: () => this._mirror.sync(cwd, skillFolders)
              })
            },
            {
              name: 'mcp',
              builtin: true,
              factory: createMcpExtension({
                // The servers come from the MCP settings of JupyterLab.
                loadConfig: () => ({ servers: [], errors: [] }),
                // pi's default transport expands `$VAR` and runs `!command` in
                // header values, and its OAuth sign-in needs a local server.
                createTransport: ({ config }) => {
                  const { url, headers } = config as Extract<
                    McpServerConfig,
                    { url: string }
                  >;
                  return new StreamableHttpTransport({ url, headers });
                },
                logPath: MCP_LOG
              })
            }
          ],
          appendSystemPromptOverride: base => [
            ...base,
            JUPYTER_INSTRUCTIONS,
            ...(options.instructions ? [options.instructions] : [])
          ],
          additionalSkillPaths: skillFolders
            .map(folder => `${DRIVE}/${folder}`)
            .filter(folder => fs.existsSync(folder))
        }
      });
      adaptProviders(services.modelRuntime);
      const created = await createAgentSessionFromServices({
        services,
        sessionManager,
        sessionStartEvent,
        customTools: this._tools(cwd, options.shell),
        excludeTools: ['powershell', ...(options.shell ? [] : ['bash'])]
      });
      const diagnostics = [
        ...services.diagnostics,
        ...collectSettingsDiagnostics(services.settingsManager)
      ];
      return { ...created, services, diagnostics };
    };
  }

  private _tools(cwd: string, shell?: ShellRunner): ToolDefinition[] {
    const operations = this._operations;
    return [
      createReadToolDefinition(cwd, { operations }),
      createWriteToolDefinition(cwd, { operations }),
      createEditToolDefinition(cwd, { operations }),
      createLsToolDefinition(cwd, { operations }),
      createFindTool(cwd, operations),
      createGrepTool(cwd, operations),
      ...(shell ? [createCockleBashTool(cwd, shell)] : [])
    ] as ToolDefinition[];
  }

  /**
   * Skill folders of the Jupyternaut settings that pi does not discover
   * itself (it reads `.agents/skills`).
   */
  private _skillFolders(): string[] {
    const folders = this._options.settingsModel?.config.skillsPaths ?? [];
    return folders
      .map(folder => folder.replace(/^\/+|\/+$/g, ''))
      .filter(folder => folder && folder !== '.agents/skills');
  }

  /**
   * Show what pi wrote in the open document of a file, unless the document
   * has unsaved changes.
   */
  private _revert(contentsPath: string): void {
    const widget = this._options.documentManager?.findWidget(
      contentsPath,
      null
    );
    if (widget && !widget.context.model.dirty) {
      void widget.context
        .revert()
        .catch(error =>
          console.warn(`pi: cannot reload the document ${contentsPath}`, error)
        );
    }
  }

  private _options: PiHost.IOptions;
  private _configChanged = new Signal<this, void>(this);
  private _mirror: DriveMirror;
  private _operations: DriveOperations;
}

export namespace PiHost {
  export interface IOptions {
    app: JupyterFrontEnd;
    toolRegistry?: IToolRegistry;
    settingsModel?: IAISettingsModel;
    mcpManager?: IMcpManager;
    /**
     * Reloads the open documents that pi writes.
     */
    documentManager?: IDocumentManager;
    translator?: ITranslator;
  }
}
