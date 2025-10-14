import { VDomModel } from '@jupyterlab/ui-components';
import { ISettingRegistry } from '@jupyterlab/settingregistry';

const PLUGIN_ID = '@jupyterlite/ai:settings-model';

export interface IProviderParameters {
  temperature?: number;
  maxTokens?: number;
  maxTurns?: number;
  supportsFillInMiddle?: boolean;
  useFilterText?: boolean;
}

export interface IProviderConfig {
  id: string;
  name: string;
  provider: string;
  model: string;
  apiKey?: string;
  baseURL?: string;
  headers?: Record<string, string>;
  parameters?: IProviderParameters;
  customSettings?: Record<string, any>;
  [key: string]: any; // Index signature for JupyterLab settings compatibility
}

export interface IMCPServerConfig {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  [key: string]: any; // Index signature for JupyterLab settings compatibility
}

export interface IAIConfig {
  // Whether to use the secrets manager
  useSecretsManager: boolean;
  // List of configured providers
  providers: IProviderConfig[];
  // Active provider IDs for different use cases
  defaultProvider: string; // Default provider for chat
  activeCompleterProvider?: string; // Provider for completions (if different)
  // When true, use the same provider for chat and completions
  useSameProviderForChatAndCompleter: boolean;
  // MCP servers configuration
  mcpServers: IMCPServerConfig[];
  // Global settings
  contextAwareness: boolean;
  codeExecution: boolean;
  systemPrompt: string;
  toolsEnabled: boolean;
  // Chat behavior settings
  sendWithShiftEnter: boolean;
  // Token usage display setting
  showTokenUsage: boolean;
  // Commands that require approval before execution
  commandsRequiringApproval: string[];
}

export class AISettingsModel extends VDomModel {
  private _config: IAIConfig = {
    useSecretsManager: true,
    providers: [],
    defaultProvider: '',
    activeCompleterProvider: undefined,
    useSameProviderForChatAndCompleter: true,
    mcpServers: [],
    contextAwareness: true,
    codeExecution: false,
    toolsEnabled: true,
    sendWithShiftEnter: false,
    showTokenUsage: false,
    commandsRequiringApproval: [
      'notebook:restart-run-all',
      'notebook:run-cell',
      'notebook:run-cell-and-select-next',
      'notebook:run-cell-and-insert-below',
      'notebook:run-all-cells',
      'notebook:run-all-above',
      'notebook:run-all-below',
      'console:execute',
      'console:execute-forced',
      'fileeditor:run-code',
      'kernelmenu:run',
      'kernelmenu:restart-and-run-all',
      'runmenu:run-all'
    ],
    systemPrompt: `You are Jupyternaut, an AI coding assistant built specifically for the JupyterLab environment.

## Your Core Mission
You're designed to be a capable partner for data science, research, and development work in Jupyter notebooks. You can help with everything from quick code snippets to complex multi-notebook projects.

## Your Capabilities
**📁 File & Project Management:**
- Create, read, edit, and organize Python files and notebooks
- Manage project structure and navigate file systems
- Help with version control and project organization

**📊 Notebook Operations:**
- Create new notebooks and manage existing ones
- Add, edit, delete, and run cells (both code and markdown)
- Help with notebook structure and organization
- Retrieve and analyze cell outputs and execution results

**🧠 Coding & Development:**
- Write, debug, and optimize Python code
- Explain complex algorithms and data structures
- Help with data analysis, visualization, and machine learning
- Support for scientific computing libraries (numpy, pandas, matplotlib, etc.)
- Code reviews and best practices recommendations

**💡 Adaptive Assistance:**
- Understand context from your current work environment
- Provide suggestions tailored to your specific use case
- Help with both quick fixes and long-term project planning

## How I Work
I can actively interact with your JupyterLab environment using specialized tools. When you ask me to perform actions, I can:
- Execute operations directly in your notebooks
- Create and modify files as needed
- Run code and analyze results
- Make systematic changes across multiple files

## My Approach
- **Context-aware**: I understand you're working in a data science/research environment
- **Practical**: I focus on actionable solutions that work in your current setup
- **Educational**: I explain my reasoning and teach best practices along the way
- **Collaborative**: Think of me as a pair programming partner, not just a code generator

## Communication Style & Agent Behavior
- **Conversational**: I maintain a friendly, natural conversation flow throughout our interaction
- **Progress Updates**: I write brief progress messages between tool uses that appear directly in our conversation
- **No Filler**: I avoid empty acknowledgments like "Sounds good!" or "Okay, I will..." - I get straight to work
- **Purposeful Communication**: I start with what I'm doing, use tools, then share what I found and what's next
- **Active Narration**: I actively write progress updates like "Looking at the current code structure..." or "Found the issue in the notebook..." between tool calls
- **Checkpoint Updates**: After several operations, I summarize what I've accomplished and what remains
- **Natural Flow**: My explanations and progress reports appear as normal conversation text, not just in tool blocks

## IMPORTANT: Always write progress messages between tools that explain what you're doing and what you found. These should be conversational updates that help the user follow along with your work.

## Technical Communication
- Code is formatted in proper markdown blocks with syntax highlighting
- Mathematical notation uses LaTeX formatting: \\(equations\\) and \\[display math\\]
- I provide context for my actions and explain my reasoning as I work
- When creating or modifying multiple files, I give brief summaries of changes
- I keep users informed of progress while staying focused on the task

## Multi-Step Task Handling
When users request complex tasks that require multiple steps (like "create a notebook with example cells"), I use tools in sequence to accomplish the complete task. For example:
- First use create_notebook to create the notebook
- Then use add_code_cell or add_markdown_cell to add cells
- Use set_cell_content to add content to cells as needed
- Use run_cell to execute code when appropriate

Always think through multi-step tasks and use tools to fully complete the user's request rather than stopping after just one action.

Ready to help you build something great! What are you working on?`
  };

  private _settingRegistry: ISettingRegistry;
  private _settings: ISettingRegistry.ISettings | null = null;

  constructor(options: AISettingsModel.IOptions) {
    super();
    this._settingRegistry = options.settingRegistry;
    this.initializeSettings();
  }

  private async initializeSettings(): Promise<void> {
    try {
      this._settings = await this._settingRegistry.load(PLUGIN_ID);
      this.loadFromSettings();

      // Listen for settings changes
      this._settings.changed.connect(this.onSettingsChanged, this);

      this.stateChanged.emit(void 0);
    } catch (error) {
      console.warn('Failed to load JupyterLab settings:', error);
      this.stateChanged.emit(void 0);
    }
  }

  private onSettingsChanged(): void {
    this.loadFromSettings();
    this.stateChanged.emit(void 0);
  }

  private loadFromSettings(): void {
    if (!this._settings) {
      return;
    }

    // Merge JupyterLab settings with defaults
    const settingsData = this._settings.composite as Partial<IAIConfig>;

    this._config = {
      ...this._config,
      ...settingsData
    };
  }

  get config(): IAIConfig {
    return { ...this._config };
  }

  get providers(): IProviderConfig[] {
    return [...this._config.providers];
  }

  getProvider(id: string): IProviderConfig | undefined {
    return this._config.providers.find(p => p.id === id);
  }

  getDefaultProvider(): IProviderConfig | undefined {
    return this.getProvider(this._config.defaultProvider);
  }

  getCompleterProvider(): IProviderConfig | undefined {
    if (this._config.useSameProviderForChatAndCompleter) {
      return this.getDefaultProvider();
    }
    return this._config.activeCompleterProvider
      ? this.getProvider(this._config.activeCompleterProvider)
      : this.getDefaultProvider();
  }

  async addProvider(
    providerConfig: Omit<IProviderConfig, 'id'>
  ): Promise<string> {
    const id = `${providerConfig.provider}-${Date.now()}`;
    const newProvider: IProviderConfig = {
      id,
      name: providerConfig.name,
      provider: providerConfig.provider,
      model: providerConfig.model,
      apiKey: providerConfig.apiKey,
      baseURL: providerConfig.baseURL,
      headers: providerConfig.headers,
      parameters: providerConfig.parameters,
      customSettings: providerConfig.customSettings
    };

    this._config.providers.push(newProvider);

    // If this is the first provider, make it active
    if (this._config.providers.length === 1) {
      // Save both providers and defaultProvider
      await this.saveSetting('providers', this._config.providers);
      this._config.defaultProvider = id;
      await this.saveSetting('defaultProvider', this._config.defaultProvider);
    } else {
      // Only save providers
      await this.saveSetting('providers', this._config.providers);
    }

    return id;
  }

  async removeProvider(id: string): Promise<void> {
    const index = this._config.providers.findIndex(p => p.id === id);
    if (index === -1) {
      return;
    }

    this._config.providers.splice(index, 1);
    await this.saveSetting('providers', this._config.providers);

    // If this was the active provider, select a new one
    if (this._config.defaultProvider === id) {
      this._config.defaultProvider =
        this._config.providers.length > 0 ? this._config.providers[0].id : '';
      await this.saveSetting('defaultProvider', this._config.defaultProvider);
    }

    if (this._config.activeCompleterProvider === id) {
      this._config.activeCompleterProvider = undefined;
      await this.saveSetting(
        'activeCompleterProvider',
        this._config.activeCompleterProvider
      );
    }
  }

  async updateProvider(
    id: string,
    updates: Partial<IProviderConfig>
  ): Promise<void> {
    const provider = this.getProvider(id);
    if (!provider) {
      return;
    }

    Object.assign(provider, updates);
    await this.saveSetting('providers', this._config.providers);
  }

  async setActiveProvider(id: string): Promise<void> {
    if (this.getProvider(id)) {
      this._config.defaultProvider = id;
      await this.saveSetting('defaultProvider', this._config.defaultProvider);
    }
  }

  async setActiveCompleterProvider(id: string | undefined): Promise<void> {
    this._config.activeCompleterProvider = id;
    await this.saveSetting(
      'activeCompleterProvider',
      this._config.activeCompleterProvider
    );
  }

  get mcpServers(): IMCPServerConfig[] {
    return [...this._config.mcpServers];
  }

  getMCPServer(id: string): IMCPServerConfig | undefined {
    return this._config.mcpServers.find(s => s.id === id);
  }

  async addMCPServer(
    serverConfig: Omit<IMCPServerConfig, 'id'>
  ): Promise<string> {
    const id = `mcp-${Date.now()}`;
    const newServer: IMCPServerConfig = {
      id,
      name: serverConfig.name,
      url: serverConfig.url,
      enabled: serverConfig.enabled
    };

    this._config.mcpServers.push(newServer);
    await this.saveSetting('mcpServers', this._config.mcpServers);
    return id;
  }

  async removeMCPServer(id: string): Promise<void> {
    const index = this._config.mcpServers.findIndex(s => s.id === id);
    if (index === -1) {
      return;
    }

    this._config.mcpServers.splice(index, 1);
    await this.saveSetting('mcpServers', this._config.mcpServers);
  }

  async updateMCPServer(
    id: string,
    updates: Partial<IMCPServerConfig>
  ): Promise<void> {
    const server = this.getMCPServer(id);
    if (!server) {
      return;
    }

    Object.assign(server, updates);
    await this.saveSetting('mcpServers', this._config.mcpServers);
  }

  async updateConfig(updates: Partial<IAIConfig>): Promise<void> {
    // Update config and save only changed settings
    const promises: Promise<void>[] = [];

    for (const [key, value] of Object.entries(updates)) {
      if (
        key in this._config &&
        this._config[key as keyof IAIConfig] !== value
      ) {
        (this._config as any)[key] = value;
        promises.push(this.saveSetting(key as keyof IAIConfig, value));
      }
    }

    // Wait for all settings to be saved
    await Promise.all(promises);
  }

  getApiKey(id: string): string {
    // First check the active completer provider
    const activeCompleterProvider = this.getCompleterProvider();
    if (activeCompleterProvider && activeCompleterProvider.id === id) {
      return activeCompleterProvider.apiKey || '';
    }

    // Fallback to active chat provider
    const activeProvider = this.getProvider(id);
    if (activeProvider) {
      return activeProvider.apiKey || '';
    }

    return '';
  }

  private async saveSetting(key: keyof IAIConfig, value: any): Promise<void> {
    try {
      if (this._settings) {
        // Only save the specific setting that changed
        if (value !== undefined) {
          await this._settings.set(key, value as any);
        }
      }
    } catch (error) {
      console.warn(
        `Failed to save setting '${key}' to JupyterLab settings, falling back to localStorage:`,
        error
      );
    }
  }
}

export namespace AISettingsModel {
  export interface IOptions {
    settingRegistry: ISettingRegistry;
  }
}
