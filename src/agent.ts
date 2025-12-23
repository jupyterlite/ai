import { ISignal, Signal } from '@lumino/signaling';
import {
  ToolLoopAgent,
  type ModelMessage,
  stepCountIs,
  type Tool,
  type LanguageModel
} from 'ai';
import { createMCPClient, type MCPClient } from '@ai-sdk/mcp';
import { ISecretsManager } from 'jupyter-secrets-manager';

import { AISettingsModel } from './models/settings-model';
import { createModel } from './providers/models';
import type { IProviderRegistry } from './tokens';
import { ITool, IToolRegistry, ITokenUsage, SECRETS_NAMESPACE } from './tokens';

/**
 * Interface for MCP client wrapper to track connection state
 */
interface IMCPClientWrapper {
  name: string;
  client: MCPClient;
}

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
    this._mcpClients = [];
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
    return this._mcpClients.some(wrapper => wrapper.name === serverName);
  }

  /**
   * Gets the MCP tools from connected servers
   */
  async getMCPTools(): Promise<Record<string, Tool<any, any>>> {
    const mcpTools: Record<string, Tool<any, any>> = {};

    for (const wrapper of this._mcpClients) {
      try {
        const tools = await wrapper.client.tools();
        Object.assign(mcpTools, tools);
      } catch (error) {
        console.warn(
          `Failed to get tools from MCP server ${wrapper.name}:`,
          error
        );
      }
    }

    return mcpTools;
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
   * Initializes MCP (Model Context Protocol) clients based on current settings.
   * Closes existing clients and connects to enabled servers from configuration.
   */
  private async _initializeMCPClients(): Promise<void> {
    const config = this._settingsModel.config;
    const enabledServers = config.mcpServers.filter(server => server.enabled);
    let connectionChanged = false;

    // Close existing clients
    for (const wrapper of this._mcpClients) {
      try {
        await wrapper.client.close();
        connectionChanged = true;
      } catch (error) {
        console.warn('Error closing MCP client:', error);
      }
    }
    this._mcpClients = [];

    for (const serverConfig of enabledServers) {
      try {
        const client = await createMCPClient({
          transport: {
            type: 'sse',
            url: serverConfig.url
          }
        });

        this._mcpClients.push({
          name: serverConfig.name,
          client
        });
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
      this._mcpConnectionChanged.emit(this._mcpClients.length > 0);
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
      await this._initializeMCPClients();
      const mcpTools = await this.getMCPTools();

      this._agentManagers.forEach(manager => {
        manager.initializeAgent(mcpTools);
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
  private _mcpClients: IMCPClientWrapper[];
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
    input: string;
  };
  tool_call_complete: {
    callId: string;
    toolName: string;
    output: string;
    isError: boolean;
  };
  tool_approval_request: {
    approvalId: string;
    toolCallId: string;
    toolName: string;
    args: unknown;
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
 * and handles the complete agent execution cycle.
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
    this._history = [];
    this._mcpTools = {};
    this._isInitializing = false;
    this._controller = null;
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
   * Gets the currently selected tools as a record.
   * @returns Record of selected tools
   */
  get selectedAgentTools(): Record<string, ITool> {
    if (!this._toolRegistry) {
      return {};
    }

    const result: Record<string, ITool> = {};
    for (const name of this._selectedToolNames) {
      const tool: ITool | null = this._toolRegistry.get(name);
      if (tool) {
        result[name] = tool;
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
   * Removes all conversation history.
   */
  clearHistory(): void {
    this._history = [];
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
   * Approves a pending tool call.
   * @param approvalId The approval ID to approve
   * @param reason Optional reason for approval
   */
  approveToolCall(approvalId: string, reason?: string): void {
    const pending = this._pendingApprovals.get(approvalId);
    if (pending) {
      pending.resolve(true, reason);
      this._pendingApprovals.delete(approvalId);
    }
  }

  /**
   * Rejects a pending tool call.
   * @param approvalId The approval ID to reject
   * @param reason Optional reason for rejection
   */
  rejectToolCall(approvalId: string, reason?: string): void {
    const pending = this._pendingApprovals.get(approvalId);
    if (pending) {
      pending.resolve(false, reason);
      this._pendingApprovals.delete(approvalId);
    }
  }

  /**
   * Generates AI response to user message using the agent.
   * Handles the complete execution cycle including tool calls.
   * @param message The user message to respond to (may include processed attachment content)
   */
  async generateResponse(message: string): Promise<void> {
    this._controller = new AbortController();

    try {
      // Ensure we have an agent
      if (!this._agent) {
        await this.initializeAgent();
      }

      if (!this._agent) {
        throw new Error('Failed to initialize agent');
      }

      // Add user message to history
      this._history.push({
        role: 'user',
        content: message
      });

      // Stream the response using ToolLoopAgent
      // Note: AgentCallParameters expects either prompt OR messages, not both
      const result = await this._agent.stream({
        messages: this._history, // Pass full history including current message
        abortSignal: this._controller.signal
      });

      await this._processStreamResult(result);

      // Update history with the full response
      const responseMessages = await result.response;
      if (responseMessages.messages && responseMessages.messages.length > 0) {
        this._history = [...this._history, ...responseMessages.messages];
      }

      // Update token usage
      const usage = await result.usage;
      if (usage) {
        this._tokenUsage.inputTokens += usage.inputTokens ?? 0;
        this._tokenUsage.outputTokens += usage.outputTokens ?? 0;
        this._tokenUsageChanged.emit(this._tokenUsage);
      }
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        this._agentEvent.emit({
          type: 'error',
          data: { error: error as Error }
        });
      }
    } finally {
      this._controller = null;
    }
  }

  /**
   * Initializes the AI agent with current settings and tools.
   * Sets up the agent with model configuration, tools, and MCP tools.
   */
  initializeAgent = async (
    mcpTools?: Record<string, Tool<any, any>>
  ): Promise<void> => {
    if (this._isInitializing) {
      return;
    }
    this._isInitializing = true;

    try {
      const config = this._settingsModel.config;
      if (mcpTools !== undefined) {
        this._mcpTools = mcpTools;
      }

      const model = await this._createModel();

      const shouldUseTools =
        config.toolsEnabled &&
        this._selectedToolNames.length > 0 &&
        this._toolRegistry &&
        Object.keys(this._toolRegistry.tools).length > 0 &&
        this._supportsToolCalling();

      // Combine selected tools with MCP tools
      const tools = shouldUseTools
        ? { ...this.selectedAgentTools, ...this._mcpTools }
        : this._mcpTools;

      const activeProviderConfig = this._settingsModel.getProvider(
        this._activeProvider
      );

      const temperature =
        activeProviderConfig?.parameters?.temperature ?? DEFAULT_TEMPERATURE;
      const maxTokens = activeProviderConfig?.parameters?.maxOutputTokens;
      const maxTurns =
        activeProviderConfig?.parameters?.maxTurns ?? DEFAULT_MAX_TURNS;

      const instructions = shouldUseTools
        ? this._getEnhancedSystemPrompt(config.systemPrompt || '')
        : config.systemPrompt || 'You are a helpful assistant.';

      this._agent = new ToolLoopAgent({
        model: model as LanguageModel,
        instructions,
        tools,
        temperature,
        maxOutputTokens: maxTokens,
        stopWhen: stepCountIs(maxTurns)
      });
    } catch (error) {
      console.warn('Failed to initialize agent:', error);
      this._agent = null;
    } finally {
      this._isInitializing = false;
    }
  };

  /**
   * Processes the stream result from agent execution.
   * Handles message streaming, tool calls, and emits appropriate events.
   * @param result The stream result from agent execution
   */
  private async _processStreamResult(result: any): Promise<void> {
    let fullResponse = '';
    let currentMessageId: string | null = null;

    // Stream text chunks
    for await (const chunk of result.textStream) {
      if (!currentMessageId) {
        currentMessageId = `msg-${Date.now()}-${Math.random()}`;
        this._agentEvent.emit({
          type: 'message_start',
          data: { messageId: currentMessageId }
        });
      }

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

    // Emit message complete
    if (currentMessageId && fullResponse) {
      this._agentEvent.emit({
        type: 'message_complete',
        data: {
          messageId: currentMessageId,
          content: fullResponse
        }
      });
    }

    // Process tool calls from steps
    const steps = await result.steps;
    for (const step of steps) {
      // Check for tool approval requests in step content
      if (step.content) {
        for (const part of step.content) {
          if (part.type === 'tool-approval-request') {
            const approvalPart = part as {
              type: 'tool-approval-request';
              approvalId: string;
              toolCall: { toolCallId: string; toolName: string; args: unknown };
            };

            // Emit approval request event
            this._agentEvent.emit({
              type: 'tool_approval_request',
              data: {
                approvalId: approvalPart.approvalId,
                toolCallId: approvalPart.toolCall.toolCallId,
                toolName: approvalPart.toolCall.toolName,
                args: approvalPart.toolCall.args
              }
            });

            // Wait for user approval
            const approved = await this._waitForApproval(
              approvalPart.approvalId
            );

            // Add approval response to history
            this._history.push({
              role: 'tool',
              content: [
                {
                  type: 'tool-approval-response',
                  approvalId: approvalPart.approvalId,
                  approved
                }
              ]
            });
          }
        }
      }

      if (step.toolCalls) {
        for (const toolCall of step.toolCalls) {
          const callId = toolCall.toolCallId;
          const toolName = toolCall.toolName;
          const input = this._formatToolInput(JSON.stringify(toolCall.args));

          this._agentEvent.emit({
            type: 'tool_call_start',
            data: {
              callId,
              toolName,
              input
            }
          });
        }
      }

      if (step.toolResults) {
        for (const toolResult of step.toolResults) {
          const callId = toolResult.toolCallId;
          const toolName = toolResult.toolName;
          const output =
            typeof toolResult.result === 'string'
              ? toolResult.result
              : JSON.stringify(toolResult.result, null, 2);
          const isError = toolResult.result?.success === false;

          this._agentEvent.emit({
            type: 'tool_call_complete',
            data: {
              callId,
              toolName,
              output,
              isError
            }
          });
        }
      }
    }
  }

  /**
   * Waits for user approval of a tool call.
   * @param approvalId The approval ID to wait for
   * @returns Promise that resolves to true if approved, false if rejected
   */
  private _waitForApproval(approvalId: string): Promise<boolean> {
    return new Promise(resolve => {
      this._pendingApprovals.set(approvalId, {
        resolve: (approved: boolean) => resolve(approved)
      });
    });
  }

  /**
   * Formats tool input for display by pretty-printing JSON strings.
   * @param input The tool input string to format
   * @returns Pretty-printed JSON string
   */
  private _formatToolInput(input: string): string {
    try {
      // Parse and re-stringify with formatting
      const parsed = JSON.parse(input);
      return JSON.stringify(parsed, null, 2);
    } catch {
      // If parsing fails, return the string as-is
      return input;
    }
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
- When you want to execute JupyterLab commands, ALWAYS use the 'discover_commands' tool first to find available commands and their metadata, with the optional query parameter.
- The query should typically be a single word, e.g., 'terminal', 'notebook', 'cell', 'file', 'edit', 'view', 'run', etc, to find relevant commands.
- If searching with a query does not yield the desired command, try again with a different query or use an empty query to list all commands.
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
  private _agent: ToolLoopAgent<never, Record<string, Tool<any, any>>> | null;
  private _history: ModelMessage[];
  private _mcpTools: Record<string, Tool<any, any>>;
  private _isInitializing: boolean;
  private _controller: AbortController | null;
  private _agentEvent: Signal<this, IAgentEvent>;
  private _tokenUsage: ITokenUsage;
  private _tokenUsageChanged: Signal<this, ITokenUsage>;
  private _activeProvider: string = '';
  private _activeProviderChanged = new Signal<this, string | undefined>(this);
  private _pendingApprovals: Map<
    string,
    { resolve: (approved: boolean, reason?: string) => void }
  > = new Map();
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
