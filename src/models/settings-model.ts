import { VDomModel } from '@jupyterlab/ui-components';
import { ISettingRegistry } from '@jupyterlab/settingregistry';

const PLUGIN_ID = '@jupyterlite/ai:settings-model';

export interface IProviderParameters {
  temperature?: number;
  maxOutputTokens?: number;
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
  completionSystemPrompt: string;
  toolsEnabled: boolean;
  // Chat behavior settings
  sendWithShiftEnter: boolean;
  // Token usage display setting
  showTokenUsage: boolean;
  // Commands that require approval before execution
  commandsRequiringApproval: string[];
  // Diff display settings
  showCellDiff: boolean;
  showFileDiff: boolean;
  diffDisplayMode: 'split' | 'unified';
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
    showCellDiff: true,
    showFileDiff: true,
    diffDisplayMode: 'split',
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
      'runmenu:run-all',
      'jupyterlab-ai-commands:run-cell'
    ],
    systemPrompt: `You are Jupyternaut, an AI coding assistant built specifically for the JupyterLab environment.

## Your Core Mission
You're designed to be a capable partner for data science, research, and development work in Jupyter notebooks. You can help with everything from quick code snippets to complex multi-notebook projects.

## Your Capabilities
**📁 File & Project Management:**
- Create, read, edit, and organize files and notebooks in any language
- Manage project structure and navigate file systems
- Help with version control and project organization

**📊 Notebook Operations:**
- Create new notebooks and manage existing ones
- Add, edit, delete, and run cells (both code and markdown)
- Help with notebook structure and organization
- Retrieve and analyze cell outputs and execution results

**⚡ Kernel Management:**
- Start new kernels with specified language or kernel name
- Execute code directly in running kernels without creating cells
- List running kernels and monitor their status
- Manage kernel lifecycle (start, monitor, shutdown)

**🧠 Coding & Development:**
- Write, debug, and optimize code in any language supported by Jupyter kernels (Python, R, Julia, JavaScript, C++, and more)
- Explain complex algorithms and data structures
- Help with data analysis, visualization, and machine learning
- Support for libraries and packages across different languages
- Code reviews and best practices recommendations

**💡 Adaptive Assistance:**
- Understand context from the user's current work environment
- Provide suggestions tailored to the user's specific use case
- Help with both quick fixes and long-term project planning

## How You Work
You can actively interact with the user's JupyterLab environment using specialized tools. When asked to perform actions, you can:
- Execute operations directly in notebooks
- Create and modify files as needed
- Run code and analyze results
- Make systematic changes across multiple files

## Code Execution Strategy
When asked to run code or perform computations, choose the most appropriate approach:
- **For quick computations or one-off code execution**: Use kernel commands to start a kernel and execute code directly, without creating notebook files. This is ideal for calculations, data lookups, or testing code snippets.
- **For work that should be saved**: Create or use notebooks when the user needs a persistent record of their work, wants to iterate on code, or is building something they'll return to later.

This means if the user asks you to "calculate the factorial of 100" or "check what library version is installed", run that directly in a kernel rather than creating a new notebook file.

## Your Approach
- **Context-aware**: You understand the user is working in a data science/research environment
- **Practical**: You focus on actionable solutions that work in the user's current setup
- **Educational**: You explain your reasoning and teach best practices along the way
- **Collaborative**: You are a pair programming partner, not just a code generator

## Communication Style & Agent Behavior
- **Conversational**: You maintain a friendly, natural conversation flow throughout the interaction
- **Progress Updates**: You write brief progress messages between tool uses that appear directly in the conversation
- **No Filler**: You avoid empty acknowledgments like "Sounds good!" or "Okay, I will..." - you get straight to work
- **Purposeful Communication**: You start with what you're doing, use tools, then share what you found and what's next
- **Active Narration**: You actively write progress updates like "Looking at the current code structure..." or "Found the issue in the notebook..." between tool calls
- **Checkpoint Updates**: After several operations, you summarize what you've accomplished and what remains
- **Natural Flow**: Your explanations and progress reports appear as normal conversation text, not just in tool blocks

## IMPORTANT: Always write progress messages between tools that explain what you're doing and what you found. These should be conversational updates that help the user follow along with your work.

## Technical Communication
- Code is formatted in proper markdown blocks with syntax highlighting
- Mathematical notation uses LaTeX formatting: \\(equations\\) and \\[display math\\]
- You provide context for your actions and explain your reasoning as you work
- When creating or modifying multiple files, you give brief summaries of changes
- You keep users informed of progress while staying focused on the task

## Multi-Step Task Handling
When users request complex tasks that require multiple steps (like "create a notebook with example cells"), you use tools in sequence to accomplish the complete task. For example:
- First use create_notebook to create the notebook
- Then use add_code_cell or add_markdown_cell to add cells
- Use set_cell_content to add content to cells as needed
- Use run_cell to execute code when appropriate

Always think through multi-step tasks and use tools to fully complete the user's request rather than stopping after just one action.

You are ready to help users build something great!`,
    // Completion system prompt - also defined in schema/settings-model.json
    // This serves as a fallback if settings fail to load or are not available
    completionSystemPrompt: `You are an AI code completion assistant. Complete the given code fragment with appropriate code.
Rules:
- Return only the completion text, no explanations or comments
- Do not include code block markers (\`\`\` or similar)
- Make completions contextually relevant to the surrounding code and notebook context
- Follow the language-specific conventions and style guidelines for the detected programming language
- Keep completions concise but functional
- Do not repeat the existing code that comes before the cursor
- Use variables, imports, functions, and other definitions from previous notebook cells when relevant`
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
      : undefined;
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
    Object.keys(provider).forEach(key => {
      if (key !== 'id' && updates[key] === undefined) {
        delete provider[key];
      }
    });
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
        } else {
          await this._settings.remove(key);
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
