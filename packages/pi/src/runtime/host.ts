import {
  createAgentSessionFromServices,
  createAgentSessionRuntime,
  createAgentSessionServices,
  createEditToolDefinition,
  createLsToolDefinition,
  createMcpExtension,
  createReadToolDefinition,
  createWriteToolDefinition,
  hasTrustRequiringProjectResources,
  ProjectTrustStore,
  resolveCliModel,
  resolveModelScopeWithDiagnostics,
  SettingsManager,
  type AgentSessionRuntime,
  type AgentSessionRuntimeDiagnostic,
  type AgentSessionServices,
  type Args,
  type CreateAgentSessionFromServicesOptions,
  type CreateAgentSessionRuntimeFactory,
  type McpServerConfig,
  type ProjectTrustContext,
  type SessionManager,
  type ToolDefinition
} from '@earendil-works/pi-coding-agent';
import { modelsAreEqual } from '@earendil-works/pi-ai';
import { StreamableHttpTransport } from '@earendil-works/pi-mcp';
import type { JupyterFrontEnd } from '@jupyterlab/application';
import type { IDocumentManager } from '@jupyterlab/docmanager';
import type { ITranslator } from '@jupyterlab/translation';
import type { IAISettingsModel, IToolRegistry } from '@jupyternaut/agent';
import childProcess from 'child_process';
import fs from 'fs';
import { Signal, type ISignal } from '@lumino/signaling';
import type { IMcpManager } from 'jupyter-mcp-manager';
import path from 'path';
import { resolveProjectTrusted } from 'pi-coding-agent-package/dist/core/project-trust.js';
import { collectSettingsDiagnostics } from 'pi-coding-agent-package/dist/core/settings-diagnostics.js';
import {
  applyToolModifiers,
  isToolModifier
} from 'pi-coding-agent-package/dist/core/settings-manager.js';

import {
  createFindTool,
  createGrepTool,
  DriveOperations,
  fdCommand
} from './drive';
import {
  JUPYTER_INSTRUCTIONS,
  jupyterExtension,
  type ApprovalHandler
} from './extension';
import { adaptProviders } from './providers';
import { dialogTrustContext } from './dialogs';
import { addProvider } from './setup';
import { createCockleBashTool, hasCockleShell, ShellRunner } from './shell';
import {
  AGENT_DIR,
  DRIVE,
  DriveMirror,
  onAgentFilesChange,
  restoreAgentDir,
  toContentsPath
} from './vfs';

/**
 * Files of the agent folder that change the available models.
 */
const CONFIG_FILES = new Set(['auth.json', 'models.json', 'settings.json']);
/**
 * Outside the agent folder: the folder is saved to the drive.
 */
const MCP_LOG = '/tmp/pi-mcp.log';
const EXECUTE_IN_KERNEL = 'jupyterlab-ai-commands:execute-in-kernel';

/**
 * The saved model scope (`/scoped-models`) of a session, as pi's main.js
 * applies it: a new session starts on the default model when the scope has
 * it, else on the first model of the scope.
 */
async function modelScope(
  services: AgentSessionServices,
  sessionManager: SessionManager
): Promise<{
  options: Pick<
    CreateAgentSessionFromServicesOptions,
    'model' | 'thinkingLevel' | 'scopedModels'
  >;
  diagnostics: AgentSessionRuntimeDiagnostic[];
}> {
  const { settingsManager, modelRuntime } = services;
  const patterns = settingsManager.getEnabledModels();
  if (!patterns?.length) {
    return { options: {}, diagnostics: [] };
  }
  const { scopedModels, diagnostics } = await resolveModelScopeWithDiagnostics(
    patterns,
    modelRuntime,
    { signal: AbortSignal.timeout(15_000) }
  );
  if (
    !scopedModels.length ||
    sessionManager.buildSessionContext().messages.length
  ) {
    return { options: { scopedModels }, diagnostics };
  }
  const provider = settingsManager.getDefaultProvider();
  const id = settingsManager.getDefaultModel();
  const saved = provider && id ? modelRuntime.getModel(provider, id) : null;
  const { model, thinkingLevel } =
    scopedModels.find(scoped => modelsAreEqual(scoped.model, saved)) ??
    scopedModels[0];
  return { options: { model, thinkingLevel, scopedModels }, diagnostics };
}

export interface IRuntimeOptions {
  cwd: string;
  sessionManager: SessionManager;
  approve: ApprovalHandler;
  /**
   * Instructions added for this front-end (terminal or chat).
   */
  instructions?: string;
  shell?: ShellRunner;
  /**
   * The model options of the `pi` command, for each session of the runtime.
   */
  args?: Pick<Args, 'model' | 'provider' | 'thinking'>;
  /**
   * Asks for the project trust; a JupyterLab dialog by default.
   */
  trustContext?: ProjectTrustContext;
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
    (
      childProcess as unknown as {
        commands: Map<string, ReturnType<typeof fdCommand>>;
      }
    ).commands.set('fd', fdCommand(this._operations));
    this.ready = restoreAgentDir({
      contents,
      drive: this._operations,
      translator: options.translator
    });
    onAgentFilesChange(files => {
      if (files.some(file => CONFIG_FILES.has(path.posix.basename(file)))) {
        this._configChanged.emit();
      }
    });
  }

  readonly ready: Promise<void>;

  /**
   * Emitted when the credentials or models of pi change, in this tab or
   * another.
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
   * The file operations of the pi tools.
   */
  get operations(): DriveOperations {
    return this._operations;
  }

  /**
   * Show the dialog to add, change or remove a model provider; resolves with
   * true when the providers of pi change.
   */
  addProvider(): Promise<boolean> {
    return addProvider(this._options.translator);
  }

  /**
   * Create the agent folder in the drive; resolves with its contents path.
   */
  async createAgentFolder(): Promise<string> {
    await this._operations.mkdir(AGENT_DIR);
    return toContentsPath(AGENT_DIR)!;
  }

  /**
   * A shell for the bash tool, when JupyterLite terminals are available.
   */
  createShell(): ShellRunner | undefined {
    const { commands } = this._options.app;
    return hasCockleShell(commands)
      ? new ShellRunner(commands, this._operations)
      : undefined;
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
    return async ({
      cwd,
      agentDir,
      sessionManager,
      sessionStartEvent,
      projectTrustContext
    }) => {
      const skillFolders = this._skillFolders();
      await this._mirror.sync(cwd, skillFolders);
      const settingsManager = SettingsManager.create(cwd, agentDir, {
        projectTrusted: false
      });
      settingsManager.setProjectTrusted(
        await this._trustProject(
          cwd,
          agentDir,
          settingsManager,
          projectTrustContext ?? options.trustContext
        )
      );
      const services = await createAgentSessionServices({
        cwd,
        agentDir,
        settingsManager,
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
      await adaptProviders(services.modelRuntime);
      const scope = await modelScope(services, sessionManager);
      const { model, provider, thinking } = options.args ?? {};
      const cli = model
        ? resolveCliModel({
            cliProvider: provider,
            cliModel: model,
            cliThinking: thinking,
            modelRuntime: services.modelRuntime
          })
        : undefined;
      const { scopedModels, ...scoped } = scope.options;
      const created = await createAgentSessionFromServices({
        services,
        sessionManager,
        sessionStartEvent,
        scopedModels,
        // The model of the pi command comes before the model scope.
        ...(cli?.model ? { model: cli.model } : scoped),
        ...((thinking ?? cli?.thinkingLevel) && {
          thinkingLevel: thinking ?? cli?.thinkingLevel
        }),
        customTools: this._tools(cwd, services.settingsManager, options.shell),
        excludeTools: ['powershell', ...(options.shell ? [] : ['bash'])]
      });
      const diagnostics = [
        ...services.diagnostics,
        ...collectSettingsDiagnostics(services.settingsManager),
        ...scope.diagnostics
      ];
      if (cli?.warning) {
        diagnostics.push({ type: 'warning', message: cli.warning });
      }
      if (cli?.error) {
        diagnostics.push({ type: 'error', message: cli.error });
      }
      return { ...created, services, diagnostics };
    };
  }

  /**
   * Whether pi loads the project resources of a folder (.pi, .agents/skills),
   * as pi's main.js decides. An answer that pi does not save (this session
   * only, a closed dialog) holds for the page, in the chat and the terminal.
   */
  private async _trustProject(
    cwd: string,
    agentDir: string,
    settings: SettingsManager,
    context?: ProjectTrustContext
  ): Promise<boolean> {
    if (!hasTrustRequiringProjectResources(cwd)) {
      return true;
    }
    const trustStore = new ProjectTrustStore(agentDir);
    const saved = trustStore.get(cwd);
    if (saved !== null) {
      return saved;
    }
    const defaultProjectTrust = settings.getDefaultProjectTrust();
    if (defaultProjectTrust !== 'ask') {
      return defaultProjectTrust === 'always';
    }
    // Only answers are kept: a question that a closed terminal never ends
    // must not block the chat.
    const trusted = await resolveProjectTrusted({
      cwd,
      trustStore,
      defaultProjectTrust,
      trustOverride: this._projectTrust.get(cwd),
      projectTrustContext: context ?? dialogTrustContext(cwd)
    });
    if (trustStore.get(cwd) === null) {
      this._projectTrust.set(cwd, trusted);
    }
    return trusted;
  }

  private _tools(
    cwd: string,
    settings: SettingsManager,
    shell?: ShellRunner
  ): ToolDefinition[] {
    const operations = this._operations;
    const autoResizeImages = settings.getImageAutoResize();
    const tools = [
      createReadToolDefinition(cwd, { operations, autoResizeImages }),
      createWriteToolDefinition(cwd, { operations }),
      createEditToolDefinition(cwd, { operations }),
      createLsToolDefinition(cwd, { operations }),
      createFindTool(cwd, operations),
      createGrepTool(cwd, operations),
      ...(shell ? [createCockleBashTool(cwd, shell)] : [])
    ] as ToolDefinition[];
    // pi applies `defaultTools` to its built-in tools, not to these SDK tools:
    // a list of only +name and -name changes this list.
    const entries = [
      settings.getGlobalSettings().defaultTools,
      settings.getProjectSettings().defaultTools
    ].flatMap(list => (Array.isArray(list) ? list : []));
    const active =
      entries.length && entries.every(isToolModifier)
        ? applyToolModifiers(
            tools.map(({ name }) => name),
            entries
          )
        : settings.getDefaultTools();
    return active
      ? tools.map(tool => ({
          ...tool,
          defaultActive: active.includes(tool.name)
        }))
      : tools;
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
  private _projectTrust = new Map<string, boolean>();
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
