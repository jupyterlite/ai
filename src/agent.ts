import { ISignal, Signal } from '@lumino/signaling';
import {
  Agent,
  AgentInputItem,
  Runner,
  RunToolApprovalItem,
  RunToolCallOutputItem,
  StreamedRunResult,
  user
} from '@openai/agents';
import { ISecretsManager } from 'jupyter-secrets-manager';

import { BrowserMCPServerStreamableHttp } from './mcp/browser';
import { AISettingsModel } from './models/settings-model';
import { createModel } from './providers/models';
import type { IProviderRegistry } from './tokens';
import { ITool, IToolRegistry, ITokenUsage, SECRETS_NAMESPACE } from './tokens';

export namespace AgentManagerFactory {
  export interface IOptions {
    /**
     * The settings model.
     */
    settingsModel: AISettingsModel;
    /**
     * The secrets manager.
     */
    secretsManager?: ISecretsManager;
    /**
     * The token used to request the secrets manager.
     */
    token: symbol;
  }
}
export class AgentManagerFactory {
  constructor(options: AgentManagerFactory.IOptions) {
    Private.setToken(options.token);
    this._settingsModel = options.settingsModel;
    this._secretsManager = options.secretsManager;
    this._mcpServers = [];
    this._mcpConnectionChanged = new Signal<this, boolean>(this);

    // Initialize agent on construction
    this._initializeAgents().catch(error =>
      console.warn('Failed to initialize agent in constructor:', error)
    );

    // Listen for settings changes
    this._settingsModel.stateChanged.connect(this._onSettingsChanged, this);
  }

  createAgent(options: IAgentManagerOptions): AgentManager {
    const agentManager = new AgentManager({
      ...options,
      secretsManager: this._secretsManager
    });
    this._agentManagers.push(agentManager);
    return agentManager;
  }

  /**
   * Signal emitted when MCP connection status changes
   */
  get mcpConnectionChanged(): ISignal<this, boolean> {
    return this._mcpConnectionChanged;
  }

  /**
   * Checks if a specific MCP server is connected by server name.
   * @param serverName The name of the MCP server to check
   * @returns True if the server is connected, false otherwise
   */
  isMCPServerConnected(serverName: string): boolean {
    return this._mcpServers.some(server => server.name === serverName);
  }

  /**
   * Handles settings changes and reinitializes the agent.
   */
  private _onSettingsChanged(): void {
    this._initializeAgents().catch(error =>
      console.warn('Failed to initialize agent on settings change:', error)
    );
  }

  /**
   * Initializes MCP (Model Context Protocol) servers based on current settings.
   * Closes existing servers and connects to enabled servers from configuration.
   */
  private async _initializeMCPServers(): Promise<void> {
    const config = this._settingsModel.config;
    const enabledServers = config.mcpServers.filter(server => server.enabled);
    let connectionChanged = false;

    // Close existing servers
    for (const server of this._mcpServers) {
      try {
        await server.close();
        connectionChanged = true;
      } catch (error) {
        console.warn('Error closing MCP server:', error);
      }
    }
    this._mcpServers = [];

    // Initialize new servers
    for (const serverConfig of enabledServers) {
      try {
        const mcpServer = new BrowserMCPServerStreamableHttp({
          url: serverConfig.url,
          name: serverConfig.name
        });
        await mcpServer.connect();
        this._mcpServers.push(mcpServer);
        connectionChanged = true;
      } catch (error) {
        console.warn(
          `Failed to connect to MCP server "${serverConfig.name}" at ${serverConfig.url}:`,
          error
        );
      }
    }

    // Emit connection change signal if there were any changes
    if (connectionChanged) {
      this._mcpConnectionChanged.emit(this._mcpServers.length > 0);
    }
  }

  /**
   * Initializes the AI agent with current settings and tools.
   * Sets up the agent with model configuration, tools, and MCP servers.
   */
  private async _initializeAgents(): Promise<void> {
    if (this._isInitializing) {
      return;
    }
    this._isInitializing = true;

    try {
      await this._initializeMCPServers();
      const mcpServers = this._mcpServers.filter(server => server !== null);

      this._agentManagers.forEach(manager => {
        manager.initializeAgent(mcpServers);
      });
    } catch (error) {
      console.warn('Failed to initialize agents:', error);
    } finally {
      this._isInitializing = false;
    }
  }

  private _agentManagers: AgentManager[] = [];
  private _settingsModel: AISettingsModel;
  private _secretsManager?: ISecretsManager;
  private _mcpServers: BrowserMCPServerStreamableHttp[];
  private _mcpConnectionChanged: Signal<this, boolean>;
  private _isInitializing: boolean = false;
}

/**
 * Default parameter values for agent configuration
 */
const DEFAULT_TEMPERATURE = 0.7;
const DEFAULT_MAX_TURNS = 25;

/**
 * Event type mapping for type safety with inlined interface definitions
 */
export interface IAgentEventTypeMap {
  message_start: {
    messageId: string;
  };
  message_chunk: {
    messageId: string;
    chunk: string;
    fullContent: string;
  };
  message_complete: {
    messageId: string;
    content: string;
  };
  tool_call_start: {
    callId: string;
    toolName: string;
    input: any;
  };
  tool_call_complete: {
    callId: string;
    toolName: string;
    output: any;
    isError: boolean;
  };
  tool_approval_required: {
    interruptionId: string;
    toolName: string;
    toolInput: any;
    callId?: string;
  };
  grouped_approval_required: {
    groupId: string;
    approvals: Array<{
      interruptionId: string;
      toolName: string;
      toolInput: any;
    }>;
  };
  error: {
    error: Error;
  };
}

/**
 * Events emitted by the AgentManager
 */
export type IAgentEvent<
  T extends keyof IAgentEventTypeMap = keyof IAgentEventTypeMap
> = T extends keyof IAgentEventTypeMap
  ? {
      type: T;
      data: IAgentEventTypeMap[T];
    }
  : never;

/**
 * Configuration options for the AgentManager
 */
export interface IAgentManagerOptions {
  /**
   * AI settings model for configuration
   */
  settingsModel: AISettingsModel;

  /**
   * Optional tool registry for managing available tools
   */
  toolRegistry?: IToolRegistry;

  /**
   * Optional provider registry for model creation
   */
  providerRegistry?: IProviderRegistry;

  /**
   * The secrets manager.
   */
  secretsManager?: ISecretsManager;

  /**
   * The active provider to use with this agent.
   */
  activeProvider?: string;

  /**
   * Initial token usage.
   */
  tokenUsage?: ITokenUsage;
}

/**
 * Manages the AI agent lifecycle and execution loop.
 * Provides agent initialization, tool management, MCP server integration,
 * and handles the complete agent execution cycle including tool approvals.
 * Emits events for UI updates instead of directly manipulating the chat interface.
 */
export class AgentManager {
  /**
   * Creates a new AgentManager instance.
   * @param options Configuration options for the agent manager
   */
  constructor(options: IAgentManagerOptions) {
    this._settingsModel = options.settingsModel;
    this._toolRegistry = options.toolRegistry;
    this._providerRegistry = options.providerRegistry;
    this._secretsManager = options.secretsManager;
    this._selectedToolNames = [];
    this._agent = null;
    this._runner = new Runner({ tracingDisabled: true });
    this._history = [];
    this._mcpServers = [];
    this._isInitializing = false;
    this._controller = null;
    this._pendingApprovals = new Map();
    this._interruptedState = null;
    this._agentEvent = new Signal<this, IAgentEvent>(this);
    this._tokenUsage = options.tokenUsage ?? {
      inputTokens: 0,
      outputTokens: 0
    };
    this._tokenUsageChanged = new Signal<this, ITokenUsage>(this);

    this.activeProvider =
      options.activeProvider ?? this._settingsModel.config.defaultProvider;

    // Initialize selected tools to all available tools by default
    if (this._toolRegistry) {
      this._selectedToolNames = Object.keys(this._toolRegistry.tools);
    }
  }

  /**
   * Signal emitted when agent events occur
   */
  get agentEvent(): ISignal<this, IAgentEvent> {
    return this._agentEvent;
  }

  /**
   * Signal emitted when the active provider has changed.
   */
  get activeProviderChanged(): ISignal<this, string | undefined> {
    return this._activeProviderChanged;
  }

  /**
   * Gets the current token usage statistics.
   */
  get tokenUsage(): ITokenUsage {
    return this._tokenUsage;
  }

  /**
   * Signal emitted when token usage statistics change.
   */
  get tokenUsageChanged(): ISignal<this, ITokenUsage> {
    return this._tokenUsageChanged;
  }

  /**
   * The active provider for this agent.
   */
  get activeProvider(): string {
    return this._activeProvider;
  }
  set activeProvider(value: string) {
    this._activeProvider = value;
    this.initializeAgent();
    this._activeProviderChanged.emit(this._activeProvider);
  }

  /**
   * Sets the selected tools by name and reinitializes the agent.
   * @param toolNames Array of tool names to select
   */
  setSelectedTools(toolNames: string[]): void {
    this._selectedToolNames = [...toolNames];
    this.initializeAgent().catch(error =>
      console.warn('Failed to initialize agent on tools change:', error)
    );
  }

  /**
   * Gets the currently selected tools as OpenAI agents tools.
   * @returns Array of selected tools formatted for OpenAI agents
   */
  get selectedAgentTools(): ITool[] {
    if (!this._toolRegistry) {
      return [];
    }

    const result: ITool[] = [];
    for (const name of this._selectedToolNames) {
      const tool: ITool | null = this._toolRegistry.get(name);
      if (tool) {
        result.push(tool);
      }
    }

    return result;
  }

  /**
   * Checks if the current configuration is valid for agent operations.
   * Uses the provider registry to determine if an API key is required.
   * @returns True if the configuration is valid, false otherwise
   */
  hasValidConfig(): boolean {
    const activeProviderConfig = this._settingsModel.getProvider(
      this._activeProvider
    );
    if (!activeProviderConfig) {
      return false;
    }

    if (!activeProviderConfig.model) {
      return false;
    }

    if (this._providerRegistry) {
      const providerInfo = this._providerRegistry.getProviderInfo(
        activeProviderConfig.provider
      );
      if (providerInfo?.apiKeyRequirement === 'required') {
        return !!activeProviderConfig.apiKey;
      }
    }

    return true;
  }

  /**
   * Clears conversation history and resets agent state.
   * Removes all conversation history, pending approvals, and interrupted state.
   */
  clearHistory(): void {
    this._history = [];
    this._runner = new Runner({ tracingDisabled: true });
    this._pendingApprovals.clear();
    this._interruptedState = null;
    // Reset token usage
    this._tokenUsage = { inputTokens: 0, outputTokens: 0 };
    this._tokenUsageChanged.emit(this._tokenUsage);
  }

  /**
   * Stops the current streaming response by aborting the request.
   */
  stopStreaming(): void {
    this._controller?.abort();
  }

  /**
   * Generates AI response to user message using the agent.
   * Handles the complete execution cycle including tool calls and approvals.
   * @param message The user message to respond to (may include processed attachment content)
   */
  async generateResponse(message: string): Promise<void> {
    const config = this._settingsModel.config;
    this._controller = new AbortController();

    try {
      // Ensure we have an agent
      if (!this._agent) {
        await this.initializeAgent();
      }

      if (!this._agent) {
        throw new Error('Failed to initialize agent');
      }

      const shouldUseTools =
        config.toolsEnabled &&
        this._selectedToolNames.length > 0 &&
        this._toolRegistry &&
        Object.keys(this._toolRegistry.tools).length > 0 &&
        this._supportsToolCalling();

      // Add user message to history
      this._history.push(user(message));

      // Get provider-specific maxTurns or use default
      const activeProviderConfig = this._settingsModel.getProvider(
        this._activeProvider
      );
      const maxTurns =
        activeProviderConfig?.parameters?.maxTurns ?? DEFAULT_MAX_TURNS;

      // Main agentic loop
      let result = await this._runner.run(this._agent, this._history, {
        stream: true,
        signal: this._controller.signal,
        ...(shouldUseTools && { maxTurns })
      });

      await this._processRunResult(result);

      let hasInterruptions =
        result.interruptions && result.interruptions.length > 0;

      while (hasInterruptions) {
        this._interruptedState = result;
        const interruptions = result.interruptions!;

        if (interruptions.length > 1) {
          await this._handleGroupedToolApprovals(interruptions);
        } else {
          await this._handleSingleToolApproval(interruptions[0]);
        }

        // Wait for all approvals to be resolved
        while (this._pendingApprovals.size > 0) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }

        // Continue execution
        result = await this._runner.run(this._agent!, result.state, {
          stream: true,
          signal: this._controller.signal,
          maxTurns
        });

        await this._processRunResult(result);
        hasInterruptions =
          result.interruptions && result.interruptions.length > 0;
      }

      // Clear interrupted state
      this._interruptedState = null;
      this._history = result.history;
    } catch (error) {
      this._agentEvent.emit({
        type: 'error',
        data: { error: error as Error }
      });
    } finally {
      this._controller = null;
    }
  }

  /**
   * Approves a tool call by interruption ID.
   * @param interruptionId The interruption ID to approve
   */
  async approveToolCall(interruptionId: string): Promise<void> {
    const pending = this._pendingApprovals.get(interruptionId);
    if (!pending) {
      console.warn(
        `No pending approval found for interruption ${interruptionId}`
      );
      return;
    }

    if (this._interruptedState) {
      this._interruptedState.state.approve(pending.interruption);
    }

    pending.approved = true;
    this._pendingApprovals.delete(interruptionId);
  }

  /**
   * Rejects a tool call by interruption ID.
   * @param interruptionId The interruption ID to reject
   */
  async rejectToolCall(interruptionId: string): Promise<void> {
    const pending = this._pendingApprovals.get(interruptionId);
    if (!pending) {
      console.warn(
        `No pending approval found for interruption ${interruptionId}`
      );
      return;
    }

    if (this._interruptedState) {
      this._interruptedState.state.reject(pending.interruption);
    }

    pending.approved = false;
    this._pendingApprovals.delete(interruptionId);
  }

  /**
   * Approves all tools in a group by group ID.
   * @param groupId The group ID containing the tool calls
   * @param interruptionIds Array of interruption IDs to approve
   */
  async approveGroupedToolCalls(
    groupId: string,
    interruptionIds: string[]
  ): Promise<void> {
    for (const interruptionId of interruptionIds) {
      const pending = this._pendingApprovals.get(interruptionId);
      if (pending && pending.groupId === groupId) {
        if (this._interruptedState) {
          this._interruptedState.state.approve(pending.interruption);
        }
        pending.approved = true;
        this._pendingApprovals.delete(interruptionId);
      }
    }
  }

  /**
   * Rejects all tools in a group by group ID.
   * @param groupId The group ID containing the tool calls
   * @param interruptionIds Array of interruption IDs to reject
   */
  async rejectGroupedToolCalls(
    groupId: string,
    interruptionIds: string[]
  ): Promise<void> {
    for (const interruptionId of interruptionIds) {
      const pending = this._pendingApprovals.get(interruptionId);
      if (pending && pending.groupId === groupId) {
        if (this._interruptedState) {
          this._interruptedState.state.reject(pending.interruption);
        }
        pending.approved = false;
        this._pendingApprovals.delete(interruptionId);
      }
    }
  }

  /**
   * Initializes the AI agent with current settings and tools.
   * Sets up the agent with model configuration, tools, and MCP servers.
   */
  initializeAgent = async (
    mcpServers?: BrowserMCPServerStreamableHttp[]
  ): Promise<void> => {
    if (this._isInitializing) {
      return;
    }
    this._isInitializing = true;

    try {
      const config = this._settingsModel.config;
      if (mcpServers !== undefined) {
        this._mcpServers = mcpServers;
      }

      const model = await this._createModel();

      const shouldUseTools =
        config.toolsEnabled &&
        this._selectedToolNames.length > 0 &&
        this._toolRegistry &&
        Object.keys(this._toolRegistry.tools).length > 0 &&
        this._supportsToolCalling();

      const tools = shouldUseTools ? this.selectedAgentTools : [];

      const activeProviderConfig = this._settingsModel.getProvider(
        this._activeProvider
      );

      const temperature =
        activeProviderConfig?.parameters?.temperature ?? DEFAULT_TEMPERATURE;
      const maxTokens = activeProviderConfig?.parameters?.maxTokens;

      this._agent = new Agent({
        name: 'Assistant',
        instructions: shouldUseTools
          ? this._getEnhancedSystemPrompt(config.systemPrompt || '')
          : config.systemPrompt || 'You are a helpful assistant.',
        model: model,
        mcpServers: this._mcpServers,
        tools,
        ...(temperature && {
          modelSettings: {
            temperature,
            maxTokens
          }
        })
      });
    } catch (error) {
      console.warn('Failed to initialize agent:', error);
      this._agent = null;
    } finally {
      this._isInitializing = false;
    }
  };

  /**
   * Processes the result stream from agent execution.
   * Handles message streaming, tool calls, and emits appropriate events.
   * @param result The async iterable result from agent execution
   */
  private async _processRunResult(
    result: StreamedRunResult<any, any>
  ): Promise<void> {
    let fullResponse = '';
    let currentMessageId: string | null = null;

    for await (const event of result) {
      if (event.type === 'raw_model_stream_event') {
        const data = event.data;

        if (data.type === 'response_started') {
          currentMessageId = `msg-${Date.now()}-${Math.random()}`;
          fullResponse = '';
          this._agentEvent.emit({
            type: 'message_start',
            data: { messageId: currentMessageId }
          });
        } else if (data.type === 'output_text_delta') {
          if (currentMessageId) {
            const chunk = data.delta || '';
            fullResponse += chunk;
            this._agentEvent.emit({
              type: 'message_chunk',
              data: {
                messageId: currentMessageId,
                chunk,
                fullContent: fullResponse
              }
            });
          }
        } else if (data.type === 'response_done') {
          if (currentMessageId) {
            this._agentEvent.emit({
              type: 'message_complete',
              data: {
                messageId: currentMessageId,
                content: fullResponse
              }
            });
            currentMessageId = null;
          }

          const usage = data.response.usage;
          const { inputTokens, outputTokens } = usage;
          this._tokenUsage.inputTokens += inputTokens;
          this._tokenUsage.outputTokens += outputTokens;
          this._tokenUsageChanged.emit(this._tokenUsage);
        } else if (data.type === 'model') {
          const modelEvent = data.event as any;
          if (modelEvent.type === 'tool-call') {
            this._handleToolCallStart(modelEvent);
          }
        }
      } else if (event.type === 'run_item_stream_event') {
        if (event.name === 'tool_output') {
          this._handleToolOutput(event);
        }
      }
    }
  }

  /**
   * Handles the start of a tool call from the model event.
   * @param modelEvent The model event containing tool call information
   */
  private _handleToolCallStart(modelEvent: any): void {
    const toolCallId = modelEvent.toolCallId;
    const toolName = modelEvent.toolName;
    const toolInput = modelEvent.input;
    let parsedToolInput;
    try {
      parsedToolInput = JSON.parse(toolInput);
    } catch (error) {
      parsedToolInput = {};
    }

    this._agentEvent.emit({
      type: 'tool_call_start',
      data: {
        callId: toolCallId,
        toolName,
        input: parsedToolInput
      }
    });
  }

  /**
   * Handles tool execution output and completion.
   * @param event The tool output event containing result information
   */
  private _handleToolOutput(event: any): void {
    const toolEvent = event;
    const toolCallOutput = toolEvent.item as RunToolCallOutputItem;
    const callId = toolCallOutput.rawItem.callId;
    const resultText =
      typeof toolCallOutput.output === 'string'
        ? toolCallOutput.output
        : JSON.stringify(toolCallOutput.output, null, 2);

    const isError =
      toolCallOutput.rawItem.type === 'function_call_result' &&
      (toolCallOutput.rawItem as any).error;

    const toolName =
      toolCallOutput.rawItem.type === 'function_call_result'
        ? toolCallOutput.rawItem.name
        : 'Unknown Tool';

    this._agentEvent.emit({
      type: 'tool_call_complete',
      data: {
        callId,
        toolName,
        output: resultText,
        isError
      }
    });
  }

  /**
   * Handles approval request for a single tool call.
   * @param interruption The tool approval interruption item
   */
  private async _handleSingleToolApproval(
    interruption: RunToolApprovalItem
  ): Promise<void> {
    const toolName = (interruption.rawItem as any)?.name || 'Unknown Tool';
    const toolInput = (interruption.rawItem as any)?.arguments || {};
    const interruptionId = `int-${Date.now()}-${Math.random()}`;
    const callId = (interruption.rawItem as any)?.callId;

    this._pendingApprovals.set(interruptionId, { interruption });

    this._agentEvent.emit({
      type: 'tool_approval_required',
      data: {
        interruptionId,
        toolName,
        toolInput,
        callId
      }
    });
  }

  /**
   * Handles approval requests for multiple grouped tool calls.
   * @param interruptions Array of tool approval interruption items
   */
  private async _handleGroupedToolApprovals(
    interruptions: RunToolApprovalItem[]
  ): Promise<void> {
    const groupId = `group-${Date.now()}-${Math.random()}`;
    const approvals = interruptions.map(interruption => {
      const toolName = (interruption.rawItem as any)?.name || 'Unknown Tool';
      const toolInput = (interruption.rawItem as any)?.arguments || {};
      const interruptionId = `int-${Date.now()}-${Math.random()}`;

      this._pendingApprovals.set(interruptionId, { interruption, groupId });

      return {
        interruptionId,
        toolName,
        toolInput
      };
    });

    this._agentEvent.emit({
      type: 'grouped_approval_required',
      data: {
        groupId,
        approvals
      }
    });
  }

  /**
   * Checks if the current provider supports tool calling.
   * @returns True if the provider supports tool calling, false otherwise
   */
  private _supportsToolCalling(): boolean {
    const activeProviderConfig = this._settingsModel.getProvider(
      this._activeProvider
    );
    if (!activeProviderConfig || !this._providerRegistry) {
      return false;
    }

    const providerInfo = this._providerRegistry.getProviderInfo(
      activeProviderConfig.provider
    );

    // Default to true if supportsToolCalling is not specified
    return providerInfo?.supportsToolCalling !== false;
  }

  /**
   * Creates a model instance based on current settings.
   * @returns The configured model instance for the agent
   */
  private async _createModel() {
    if (!this._activeProvider) {
      throw new Error('No active provider configured');
    }
    const activeProviderConfig = this._settingsModel.getProvider(
      this._activeProvider
    );
    if (!activeProviderConfig) {
      throw new Error('No active provider configured');
    }
    const provider = activeProviderConfig.provider;
    const model = activeProviderConfig.model;
    const baseURL = activeProviderConfig.baseURL;

    let apiKey: string;
    if (this._secretsManager && this._settingsModel.config.useSecretsManager) {
      apiKey =
        (
          await this._secretsManager.get(
            Private.getToken(),
            SECRETS_NAMESPACE,
            `${provider}:apiKey`
          )
        )?.value ?? '';
    } else {
      apiKey = this._settingsModel.getApiKey(activeProviderConfig.id);
    }

    return createModel(
      {
        provider,
        model,
        apiKey,
        baseURL
      },
      this._providerRegistry
    );
  }

  /**
   * Enhances the base system prompt with tool usage guidelines.
   * @param baseSystemPrompt The base system prompt from settings
   * @returns The enhanced system prompt with tool usage instructions
   */
  private _getEnhancedSystemPrompt(baseSystemPrompt: string): string {
    const progressReportingPrompt = `

IMPORTANT: Follow this message flow pattern for better user experience:

1. FIRST: Explain what you're going to do and your approach
2. THEN: Execute tools (these will show automatically with step numbers)
3. FINALLY: Provide a concise summary of what was accomplished

Example flow:
- "I'll help you create a notebook with example cells. Let me first create the file structure, then add Python and Markdown cells."
- [Tool executions happen with automatic step display]
- "Successfully created your notebook with 3 cells: a title, code example, and visualization cell."

Guidelines:
- Start responses with your plan/approach before tool execution
- Let the system handle tool execution display (don't duplicate details)
- End with a brief summary of accomplishments
- Use natural, conversational tone throughout

COMMAND DISCOVERY:
- When you want to execute JupyterLab commands, ALWAYS use the 'discover_commands' tool first to find available commands and their metadata.
- This ensures you have complete information about command IDs, descriptions, and required arguments before attempting to execute them. Only after discovering the available commands should you use the 'execute_command' tool with the correct command ID and arguments.

TOOL SELECTION GUIDELINES:
- For file operations (create, read, write, modify files and directories): Use dedicated file manipulation tools
- For general JupyterLab UI interactions (opening panels, running commands, navigating interface): Use the general command tool (execute_command)
- Examples of file operations: Creating notebooks, editing code files, managing project structure
- Examples of UI interactions: Opening terminal, switching tabs, running notebook cells, accessing menus
`;

    return baseSystemPrompt + progressReportingPrompt;
  }

  // Private attributes
  private _settingsModel: AISettingsModel;
  private _toolRegistry?: IToolRegistry;
  private _providerRegistry?: IProviderRegistry;
  private _secretsManager?: ISecretsManager;
  private _selectedToolNames: string[];
  private _agent: Agent | null;
  private _runner: Runner;
  private _history: AgentInputItem[];
  private _mcpServers: BrowserMCPServerStreamableHttp[];
  private _isInitializing: boolean;
  private _controller: AbortController | null;
  private _pendingApprovals: Map<
    string,
    { interruption: RunToolApprovalItem; approved?: boolean; groupId?: string }
  >;
  private _interruptedState: any;
  private _agentEvent: Signal<this, IAgentEvent>;
  private _tokenUsage: ITokenUsage;
  private _tokenUsageChanged: Signal<this, ITokenUsage>;
  private _activeProvider: string = '';
  private _activeProviderChanged = new Signal<this, string | undefined>(this);
}

namespace Private {
  /**
   * The token to use with the secrets manager, setter and getter.
   */
  let secretsToken: symbol;
  export function setToken(value: symbol): void {
    secretsToken = value;
  }
  export function getToken(): symbol {
    return secretsToken;
  }
}
