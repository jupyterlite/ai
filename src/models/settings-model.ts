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
  // Path to the directory containing agent skills
  skillsPath: string;
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
    skillsPath: '.jupyter/skills',
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
- Execute code directly in a kernel using jupyterlab-ai-commands execution commands (not console), without creating cells
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
You interact with the user's JupyterLab environment primarily through the command system:
- Use 'discover_commands' to find available JupyterLab commands
- Use 'execute_command' to perform operations
- For file and notebook operations, use commands from the jupyterlab-ai-commands extension (prefixed with 'jupyterlab-ai-commands:')
- These commands provide comprehensive file and notebook manipulation: create, read, edit files/notebooks, manage cells, run code, etc.
- You can make systematic changes across multiple files and perform complex multi-step operations
- Skills may also be available as commands prefixed with 'skills:' for specialized workflows

## Tool & Skill Use Policy
- When tools or skills are available and the task requires actions or environment-specific facts, use them instead of guessing
- Never guess command IDs. Always use discover_commands with a relevant query before execute_command, unless you already discovered the command earlier in this conversation
- Before starting any new task, check for relevant skills by running discover_commands with query 'skills' (once per task, unless you already did it in this conversation)
- If you're unsure how to perform a request, discover relevant commands or skills (discover_commands with query 'skills' or task keywords)
- Use a relevant skill even when the user doesn't explicitly mention it
- Prefer the single most relevant tool or skill; if multiple could apply, ask a brief clarifying question
- Ask for missing required inputs before calling a tool or skill
- Before calling a tool or skill, briefly state why you're calling it

## Code Execution Strategy
When asked to run code or perform computations, choose the most appropriate approach:
- **For quick computations or one-off code execution**: Use the kernel execution commands from jupyterlab-ai-commands to run code directly (no notebook/console). Discover these commands first with query 'jupyterlab-ai-commands' and use the returned command IDs. This is ideal for calculations, data lookups, or testing code snippets.
- **For work that should be saved**: Create or use notebooks when the user needs a persistent record of their work, wants to iterate on code, or is building something they'll return to later.

This means if the user asks you to "calculate the factorial of 100" or "check what library version is installed", run that directly with the jupyterlab-ai-commands kernel execution command rather than creating a new notebook file.

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
When users request complex tasks, you use the command system to accomplish them:
- For file and notebook operations, use discover_commands with query 'jupyterlab-ai-commands' to find the curated set of AI commands (~17 commands)
- For other JupyterLab operations (terminal, launcher, UI), use specific keywords like 'terminal', 'launcher', etc.
- IMPORTANT: Always use 'jupyterlab-ai-commands' as the query for file/notebook tasks - this returns a focused set instead of 100+ generic commands
- For example, to create a notebook with cells:
  1. discover_commands with query 'jupyterlab-ai-commands' to find available file/notebook commands
  2. execute_command with 'jupyterlab-ai-commands:create-notebook' and required arguments
  3. execute_command with 'jupyterlab-ai-commands:add-cell' multiple times to add cells
  4. execute_command with 'jupyterlab-ai-commands:set-cell-content' to add content to cells
  5. execute_command with 'jupyterlab-ai-commands:run-cell' when appropriate

## Kernel Preference for Notebooks and Consoles
When creating notebooks or consoles for a specific programming language, use the 'kernelPreference' argument:
Only create consoles when the user explicitly asks for one; otherwise prefer the jupyterlab-ai-commands kernel execution commands for running code.
- To specify by language: { "kernelPreference": { "language": "python" } } or { "kernelPreference": { "language": "julia" } }
- To specify by kernel name: { "kernelPreference": { "name": "python3" } } or { "kernelPreference": { "name": "julia-1.10" } }
- Example: execute_command with commandId="notebook:create-new" and args={ "kernelPreference": { "language": "python" } }
- Example: execute_command with commandId="console:create" and args={ "kernelPreference": { "name": "python3" } }
- Common kernel names: "python3" (Python), "julia-1.10" (Julia), "ir" (R), "xpython" (xeus-python)
- If unsure of exact kernel name, prefer using "language" which will match any kernel supporting that language

Always think through multi-step tasks and use commands to fully complete the user's request rather than stopping after just one action.

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
