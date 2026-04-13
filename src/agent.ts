import { createMCPClient, type MCPClient } from '@ai-sdk/mcp';
import type { IMessageContent } from '@jupyter/chat';
import { IRenderMimeRegistry } from '@jupyterlab/rendermime';
import { PromiseDelegate } from '@lumino/coreutils';
import { ISignal, Signal } from '@lumino/signaling';
import {
  ToolLoopAgent,
  type ModelMessage,
  type LanguageModel,
  stepCountIs,
  type StreamTextResult,
  type ToolApprovalRequestOutput,
  type TypedToolError,
  type TypedToolOutputDenied,
  type TypedToolResult,
  type AssistantModelMessage
} from 'ai';
import { ISecretsManager } from 'jupyter-secrets-manager';

import { createModel } from './providers/models';
import { getEffectiveContextWindow } from './providers/model-info';
import {
  createProviderTools,
  type IProviderCustomSettings
} from './providers/provider-tools';
import {
  type IAgentManager,
  type IAgentManagerFactory,
  type IAISettingsModel,
  type IProviderInfo,
  type IProviderRegistry,
  type ISkillRegistry,
  type ISkillSummary,
  type ITool,
  type IToolRegistry,
  type ITokenUsage,
  type ToolMap,
  SECRETS_NAMESPACE
} from './tokens';

/**
 * Interface for MCP client wrapper to track connection state
 */
interface IMCPClientWrapper {
  name: string;
  client: MCPClient;
}

/**
 * Result from processing a stream, including approval info if applicable.
 */
interface IStreamProcessResult {
  /**
   * Whether an approval request was encountered and processed.
   */
  approvalProcessed: boolean;
  /**
   * Whether the stream was aborted before completion.
   */
  aborted: boolean;
  /**
   * The approval response message to add to history (if approval was processed).
   */
  approvalResponse?: ModelMessage;
}

/**
 * The agent manager factory namespace.
 */
export namespace AgentManagerFactory {
  export interface IOptions {
    /**
     * The settings model.
     */
    settingsModel: IAISettingsModel;
    /**
     * The skill registry for discovering skills.
     */
    skillRegistry?: ISkillRegistry;
    /**
     * The secrets manager.
     */
    secretsManager?: ISecretsManager;
    /**
     * The token used to request the secrets manager.
     */
    token: symbol | null;
  }
}

/**
 * The agent manager factory.
 */
export class AgentManagerFactory implements IAgentManagerFactory {
  constructor(options: AgentManagerFactory.IOptions) {
    Private.setToken(options.token);
    this._settingsModel = options.settingsModel;
    this._skillRegistry = options.skillRegistry;
    this._secretsManager = options.secretsManager;
    this._mcpClients = [];
    this._mcpConnectionChanged = new Signal<this, boolean>(this);

    if (this._skillRegistry) {
      this._skillRegistry.skillsChanged.connect(() => {
        this.refreshSkillSnapshots();
      });
    }

    // Initialize agent on construction
    this._initializeAgents().catch(error =>
      console.warn('Failed to initialize agent in constructor:', error)
    );

    // Listen for settings changes
    this._settingsModel.stateChanged.connect(this._onSettingsChanged, this);

    // Disable the secrets manager if the token is empty.
    if (!options.token) {
      this._secretsManager = undefined;
    }
  }

  /**
   * Create a new agent.
   */
  createAgent(options: IAgentManager.IOptions): IAgentManager {
    const agentManager = new AgentManager({
      ...options,
      skillRegistry: this._skillRegistry,
      secretsManager: this._secretsManager
    });
    this._agentManagers.push(agentManager);

    // New chats can be created before MCP setup finishes.
    // Reinitialize them with connected MCP tools once it does.
    this._initQueue
      .then(() => this.getMCPTools())
      .then(mcpTools => {
        if (Object.keys(mcpTools).length > 0) {
          agentManager.initializeAgent(mcpTools);
        }
      })
      .catch(error =>
        console.warn('Failed to pass MCP tools to new agent:', error)
      );

    return agentManager;
  }

  /**
   * Signal emitted when MCP connection status changes
   */
  get mcpConnectionChanged(): ISignal<this, boolean> {
    return this._mcpConnectionChanged;
  }

  /**
   * Checks whether a specific MCP server is connected.
   * @param serverName The name of the MCP server to check
   * @returns True if the server is connected, false otherwise
   */
  isMCPServerConnected(serverName: string): boolean {
    return this._mcpClients.some(wrapper => wrapper.name === serverName);
  }

  /**
   * Gets the MCP tools from connected servers
   */
  async getMCPTools(): Promise<ToolMap> {
    const mcpTools: ToolMap = {};

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
            type: 'http',
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
    this._initQueue = this._initQueue
      .catch(() => undefined)
      .then(async () => {
        try {
          await this._initializeMCPClients();
          const mcpTools = await this.getMCPTools();

          this._agentManagers.forEach(manager => {
            manager.initializeAgent(mcpTools);
          });
        } catch (error) {
          console.warn('Failed to initialize agents:', error);
        }
      });
    return this._initQueue;
  }

  /**
   * Refresh skill snapshots across all agents.
   */
  refreshSkillSnapshots(): void {
    this._agentManagers.forEach(manager => {
      manager.refreshSkills();
    });
  }

  private _agentManagers: IAgentManager[] = [];
  private _settingsModel: IAISettingsModel;
  private _skillRegistry?: ISkillRegistry;
  private _secretsManager?: ISecretsManager;
  private _mcpClients: IMCPClientWrapper[];
  private _mcpConnectionChanged: Signal<this, boolean>;
  private _initQueue: Promise<void> = Promise.resolve();
}

/**
 * Default parameter values for agent configuration
 */
const DEFAULT_TEMPERATURE = 0.7;
const DEFAULT_MAX_TURNS = 25;

/**
 * Cached configuration used to (re)build the agent.
 */
interface IAgentConfig {
  model: LanguageModel;
  tools: ToolMap;
  temperature: number;
  maxOutputTokens?: number;
  maxTurns: number;
  baseSystemPrompt: string;
  shouldUseTools: boolean;
}

/**
 * Manages the AI agent lifecycle and execution loop.
 * Provides agent initialization, tool management, MCP server integration,
 * and handles the complete agent execution cycle.
 * Emits events for UI updates instead of directly manipulating the chat interface.
 */
export class AgentManager implements IAgentManager {
  /**
   * Creates a new AgentManager instance.
   * @param options Configuration options for the agent manager
   */
  constructor(options: IAgentManager.IOptions) {
    this._settingsModel = options.settingsModel;
    this._toolRegistry = options.toolRegistry;
    this._providerRegistry = options.providerRegistry;
    this._skillRegistry = options.skillRegistry;
    this._secretsManager = options.secretsManager;
    this._selectedToolNames = [];
    this._agent = null;
    this._history = [];
    this._mcpTools = {};
    this._controller = null;
    this._agentEvent = new Signal<this, IAgentManager.IAgentEvent>(this);
    this._tokenUsage = options.tokenUsage ?? {
      inputTokens: 0,
      outputTokens: 0
    };
    this._tokenUsageChanged = new Signal<this, ITokenUsage>(this);
    this._skills = [];
    this._agentConfig = null;
    this._renderMimeRegistry = options.renderMimeRegistry;
    this._streaming.resolve();

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
  get agentEvent(): ISignal<this, IAgentManager.IAgentEvent> {
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
   * Refresh the skills snapshot and rebuild the agent if resources are ready.
   */
  refreshSkills(): void {
    this._initQueue = this._initQueue
      .catch(() => undefined)
      .then(async () => {
        this._refreshSkills();
        if (!this._agentConfig) {
          return;
        }
        this._rebuildAgent();
      });
  }

  /**
   * The active provider for this agent.
   */
  get activeProvider(): string {
    return this._activeProvider;
  }
  set activeProvider(value: string) {
    const previousProvider = this._activeProvider;
    this._activeProvider = value;

    // Reset request-level context estimate only when switching between providers.
    if (previousProvider && previousProvider !== value) {
      this._tokenUsage.lastRequestInputTokens = undefined;
    }

    this._tokenUsage.contextWindow = this._getActiveContextWindow();

    this._tokenUsageChanged.emit(this._tokenUsage);
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
  get selectedAgentTools(): ToolMap {
    if (!this._toolRegistry) {
      return {};
    }

    const result: ToolMap = {};
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
   */
  async clearHistory(): Promise<void> {
    // Stop any ongoing streaming
    this.stopStreaming('Chat cleared');

    await this._streaming.promise;

    // Clear history and token usage
    this._history = [];
    this._tokenUsage = {
      inputTokens: 0,
      outputTokens: 0,
      contextWindow: this._getActiveContextWindow()
    };
    this._tokenUsageChanged.emit(this._tokenUsage);
  }

  /**
   * Sets the history with a list of messages from the chat.
   * @param messages The chat messages to set as history
   */
  setHistory(messages: IMessageContent[]): void {
    // Stop any ongoing streaming and reject awaiting approvals
    this.stopStreaming();

    for (const [approvalId, pending] of this._pendingApprovals) {
      pending.resolve(false, 'Chat history changed');
      this._agentEvent.emit({
        type: 'tool_approval_resolved',
        data: { approvalId, approved: false }
      });
    }
    this._pendingApprovals.clear();

    // Convert chat messages to model messages
    const modelMessages = messages.map(msg => {
      const isAIMessage = msg.sender.username === 'ai-assistant';
      return {
        role: isAIMessage ? 'assistant' : 'user',
        content: msg.body
      } as ModelMessage;
    });
    this._history = Private.sanitizeModelMessages(modelMessages);
  }

  /**
   * Stops the current streaming response by aborting the request.
   * Resolve any pending approval.
   */
  stopStreaming(reason?: string): void {
    this._controller?.abort();

    // Reject any pending approvals
    for (const [approvalId, pending] of this._pendingApprovals) {
      pending.resolve(false, reason ?? 'Stream ended by user');
      this._agentEvent.emit({
        type: 'tool_approval_resolved',
        data: { approvalId, approved: false }
      });
    }
    this._pendingApprovals.clear();
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
      this._agentEvent.emit({
        type: 'tool_approval_resolved',
        data: { approvalId, approved: true }
      });
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
      this._agentEvent.emit({
        type: 'tool_approval_resolved',
        data: { approvalId, approved: false }
      });
    }
  }

  /**
   * Generates AI response to user message using the agent.
   * Handles the complete execution cycle including tool calls.
   * @param message The user message to respond to (may include processed attachment content)
   */
  async generateResponse(message: string): Promise<void> {
    this._streaming = new PromiseDelegate();
    this._controller = new AbortController();
    const responseHistory: ModelMessage[] = [];
    try {
      // Ensure we have an agent
      if (!this._agent) {
        await this.initializeAgent();
      }

      if (!this._agent) {
        throw new Error('Failed to initialize agent');
      }

      // Add user message to history
      responseHistory.push({
        role: 'user',
        content: message
      });

      let continueLoop = true;
      while (continueLoop) {
        const result = await this._agent.stream({
          messages: [...this._history, ...responseHistory],
          abortSignal: this._controller.signal
        });

        const streamResult = await this._processStreamResult(result);

        if (streamResult.aborted) {
          try {
            const responseMessages = await result.response;
            if (responseMessages.messages?.length) {
              this._history.push(
                ...Private.sanitizeModelMessages(responseMessages.messages)
              );
            }
          } catch {
            // Aborting before a step finishes leaves no completed response to persist.
          }
          break;
        }

        // Get response messages for completed steps.
        const responseMessages = await result.response;

        // Add response messages to history
        if (responseMessages.messages?.length) {
          responseHistory.push(...responseMessages.messages);
        }

        // Add approval response if processed
        if (streamResult.approvalResponse) {
          // Check if the last message is a tool message we can append to
          const lastMsg = responseHistory[responseHistory.length - 1];
          if (
            lastMsg &&
            lastMsg.role === 'tool' &&
            Array.isArray(lastMsg.content) &&
            Array.isArray(streamResult.approvalResponse.content)
          ) {
            const toolContent = lastMsg.content as unknown[];
            toolContent.push(...streamResult.approvalResponse.content);
          } else {
            // Add as separate message
            responseHistory.push(streamResult.approvalResponse);
          }
        }

        continueLoop = streamResult.approvalProcessed;
      }

      // Add the messages to the history only if the response ended without error.
      this._history.push(...Private.sanitizeModelMessages(responseHistory));
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        this._agentEvent.emit({
          type: 'error',
          data: { error: error as Error }
        });
      }
    } finally {
      this._controller = null;
      this._streaming.resolve();
    }
  }

  /**
   * Updates cumulative token usage statistics from a completed model step.
   */
  private _updateTokenUsage(
    usage: { inputTokens?: number; outputTokens?: number } | undefined,
    lastRequestInputTokens?: number
  ): void {
    const contextWindow = this._getActiveContextWindow();
    const estimatedRequestInputTokens =
      lastRequestInputTokens ?? usage?.inputTokens;

    if (usage) {
      this._tokenUsage.inputTokens += usage.inputTokens ?? 0;
      this._tokenUsage.outputTokens += usage.outputTokens ?? 0;
    }

    this._tokenUsage.lastRequestInputTokens = estimatedRequestInputTokens;
    this._tokenUsage.contextWindow = contextWindow;

    this._tokenUsageChanged.emit(this._tokenUsage);
  }

  /**
   * Gets the configured context window for the active provider.
   */
  private _getActiveContextWindow(): number | undefined {
    const activeProviderConfig = this._settingsModel.getProvider(
      this._activeProvider
    );
    return getEffectiveContextWindow(
      activeProviderConfig,
      this._providerRegistry
    );
  }

  /**
   * Initializes the AI agent with current settings and tools.
   * Sets up the agent with model configuration, tools, and MCP tools.
   */
  initializeAgent = async (mcpTools?: ToolMap): Promise<void> => {
    this._initQueue = this._initQueue
      .catch(() => undefined)
      .then(async () => {
        try {
          this._refreshSkills();
          await this._prepareAgentConfig(mcpTools);
          this._rebuildAgent();
        } catch (error) {
          console.warn('Failed to initialize agent:', error);
          this._agent = null;
        }
      });
    return this._initQueue;
  };

  /**
   * Refresh the in-memory skills snapshot from the skill registry.
   */
  private _refreshSkills(): void {
    if (!this._skillRegistry) {
      this._skills = [];
      return;
    }
    this._skills = this._skillRegistry.listSkills();
  }

  /**
   * Prepare model, tools, and settings needed to (re)build the agent.
   */
  private async _prepareAgentConfig(mcpTools?: ToolMap): Promise<void> {
    const config = this._settingsModel.config;
    if (mcpTools !== undefined) {
      this._mcpTools = mcpTools;
    }

    const model = await this._createModel();

    const supportsToolCalling = this._supportsToolCalling();
    const canUseTools = config.toolsEnabled && supportsToolCalling;
    const hasFunctionToolRegistry = !!(
      this._toolRegistry && Object.keys(this._toolRegistry.tools).length > 0
    );
    const selectedFunctionTools =
      canUseTools && hasFunctionToolRegistry ? this.selectedAgentTools : {};
    const functionTools = canUseTools
      ? { ...selectedFunctionTools, ...this._mcpTools }
      : {};

    const activeProviderConfig = this._settingsModel.getProvider(
      this._activeProvider
    );
    const activeProviderInfo =
      activeProviderConfig && this._providerRegistry
        ? this._providerRegistry.getProviderInfo(activeProviderConfig.provider)
        : null;
    const contextWindow = getEffectiveContextWindow(
      activeProviderConfig,
      this._providerRegistry
    );

    this._tokenUsage.contextWindow = contextWindow;
    this._tokenUsageChanged.emit(this._tokenUsage);

    const temperature =
      activeProviderConfig?.parameters?.temperature ?? DEFAULT_TEMPERATURE;
    const maxTokens = activeProviderConfig?.parameters?.maxOutputTokens;
    const maxTurns =
      activeProviderConfig?.parameters?.maxTurns ?? DEFAULT_MAX_TURNS;

    const tools = this._buildRuntimeTools({
      providerInfo: activeProviderInfo,
      customSettings: activeProviderConfig?.customSettings,
      functionTools,
      includeProviderTools: canUseTools
    });

    const shouldUseTools = canUseTools && Object.keys(tools).length > 0;

    this._agentConfig = {
      model,
      tools,
      temperature,
      maxOutputTokens: maxTokens,
      maxTurns,
      baseSystemPrompt: config.systemPrompt || '',
      shouldUseTools
    };
  }

  /**
   * Build the runtime tool map used by the agent.
   */
  private _buildRuntimeTools(options: {
    providerInfo?: IProviderInfo | null;
    customSettings?: IProviderCustomSettings;
    functionTools: ToolMap;
    includeProviderTools: boolean;
  }): ToolMap {
    const providerTools = options.includeProviderTools
      ? createProviderTools({
          providerInfo: options.providerInfo,
          customSettings: options.customSettings,
          hasFunctionTools: Object.keys(options.functionTools).length > 0
        })
      : {};

    return {
      ...providerTools,
      ...options.functionTools
    };
  }

  /**
   * Rebuild the agent using cached resources and the current skills snapshot.
   */
  private _rebuildAgent(): void {
    if (!this._agentConfig) {
      this._agent = null;
      return;
    }

    const {
      model,
      tools,
      temperature,
      maxOutputTokens,
      maxTurns,
      baseSystemPrompt,
      shouldUseTools
    } = this._agentConfig;

    const baseInstructions = shouldUseTools
      ? this._getEnhancedSystemPrompt(baseSystemPrompt, tools)
      : baseSystemPrompt || 'You are a helpful assistant.';
    const richOutputWorkflowInstruction = shouldUseTools
      ? '- When the user asks for visual or rich outputs, prefer running code/commands that produce those outputs and describe that they will be rendered in chat.'
      : '- When tools are unavailable, explain the limitation clearly and provide concrete steps the user can run to produce the desired rich outputs.';
    const supportedMimeTypesInstruction =
      this._getSupportedMimeTypesInstruction();
    const instructions = `${baseInstructions}

RICH OUTPUT RENDERING:
- The chat UI can render rich MIME outputs as separate assistant messages.
- ${supportedMimeTypesInstruction}
- Use only MIME types from the supported list when creating MIME bundles. Do not invent MIME keys.
- Do not claim that you cannot display maps, images, or rich outputs in chat.
${richOutputWorkflowInstruction}`;

    this._agent = new ToolLoopAgent({
      model,
      instructions,
      tools,
      temperature,
      maxOutputTokens,
      stopWhen: stepCountIs(maxTurns)
    });
  }

  /**
   * Processes the stream result from agent execution.
   * Handles message streaming, tool calls, and emits appropriate events.
   * @param result The stream result from agent execution
   * @returns Processing result including approval info if applicable
   */
  private async _processStreamResult(
    result: StreamTextResult<ToolMap, never>
  ): Promise<IStreamProcessResult> {
    let fullResponse = '';
    let currentMessageId: string | null = null;
    const processResult: IStreamProcessResult = {
      approvalProcessed: false,
      aborted: false
    };

    for await (const part of result.fullStream) {
      switch (part.type) {
        case 'text-delta':
          if (!currentMessageId) {
            currentMessageId = `msg-${Date.now()}-${Math.random()}`;
            this._agentEvent.emit({
              type: 'message_start',
              data: { messageId: currentMessageId }
            });
          }
          fullResponse += part.text;
          this._agentEvent.emit({
            type: 'message_chunk',
            data: {
              messageId: currentMessageId,
              chunk: part.text,
              fullContent: fullResponse
            }
          });
          break;

        case 'tool-call':
          // Complete current message before tool call
          if (currentMessageId && fullResponse) {
            this._emitMessageComplete(currentMessageId, fullResponse);
            currentMessageId = null;
            fullResponse = '';
          }
          this._agentEvent.emit({
            type: 'tool_call_start',
            data: {
              callId: part.toolCallId,
              toolName: part.toolName,
              input: this._formatToolInput(JSON.stringify(part.input))
            }
          });
          break;

        case 'tool-result':
          this._handleToolResult(part);
          break;

        case 'tool-error':
          this._handleToolError(part);
          break;

        case 'tool-output-denied':
          this._handleToolOutputDenied(part);
          break;

        case 'tool-approval-request':
          // Complete current message before approval
          if (currentMessageId && fullResponse) {
            this._emitMessageComplete(currentMessageId, fullResponse);
            currentMessageId = null;
            fullResponse = '';
          }
          await this._handleApprovalRequest(part, processResult);
          break;

        case 'finish-step':
          this._updateTokenUsage(part.usage, part.usage.inputTokens);
          break;

        case 'abort':
          processResult.aborted = true;
          break;

        // Ignore: text-start, text-end, finish, error, and others
        default:
          break;
      }
    }

    // Complete final message if content remains
    if (currentMessageId && fullResponse) {
      this._emitMessageComplete(currentMessageId, fullResponse);
    }

    return processResult;
  }

  /**
   * Emits a message_complete event.
   */
  private _emitMessageComplete(messageId: string, content: string): void {
    this._agentEvent.emit({
      type: 'message_complete',
      data: { messageId, content }
    });
  }

  /**
   * Handles tool-result stream parts.
   */
  private _handleToolResult(part: TypedToolResult<ToolMap>): void {
    const isError =
      typeof part.output === 'object' &&
      part.output !== null &&
      'success' in part.output &&
      part.output.success === false;

    this._agentEvent.emit({
      type: 'tool_call_complete',
      data: {
        callId: part.toolCallId,
        toolName: part.toolName,
        outputData: part.output,
        isError
      }
    });
  }

  /**
   * Handles tool-error stream parts.
   */
  private _handleToolError(part: TypedToolError<ToolMap>): void {
    const output =
      typeof part.error === 'string'
        ? part.error
        : part.error instanceof Error
          ? part.error.message
          : JSON.stringify(part.error, null, 2);

    this._agentEvent.emit({
      type: 'tool_call_complete',
      data: {
        callId: part.toolCallId,
        toolName: part.toolName,
        outputData: output,
        isError: true
      }
    });
  }

  /**
   * Handles tool-output-denied stream parts.
   */
  private _handleToolOutputDenied(part: TypedToolOutputDenied<ToolMap>): void {
    this._agentEvent.emit({
      type: 'tool_call_complete',
      data: {
        callId: part.toolCallId,
        toolName: part.toolName,
        outputData: 'Tool output was denied.',
        isError: true
      }
    });
  }

  /**
   * Handles tool-approval-request stream parts.
   */
  private async _handleApprovalRequest(
    part: ToolApprovalRequestOutput<ToolMap>,
    result: IStreamProcessResult
  ): Promise<void> {
    const { approvalId, toolCall } = part;

    this._agentEvent.emit({
      type: 'tool_approval_request',
      data: {
        approvalId,
        toolCallId: toolCall.toolCallId,
        toolName: toolCall.toolName,
        args: toolCall.input
      }
    });

    const approved = await this._waitForApproval(approvalId);

    result.approvalProcessed = true;
    result.approvalResponse = {
      role: 'tool',
      content: [
        {
          type: 'tool-approval-response',
          approvalId,
          approved
        }
      ]
    };
  }

  /**
   * Waits for user approval of a tool call.
   * @param approvalId The approval ID to wait for
   * @returns Promise that resolves to true if approved, false if rejected
   */
  private _waitForApproval(approvalId: string): Promise<boolean> {
    return new Promise(resolve => {
      this._pendingApprovals.set(approvalId, {
        resolve: (approved: boolean) => {
          resolve(approved);
        }
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
      const parsed = JSON.parse(input);
      return JSON.stringify(parsed, null, 2);
    } catch {
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
      const token = Private.getToken();
      if (!token) {
        // This should never happen, the secrets manager should be disabled.
        console.error(
          '@jupyterlite/ai::AgentManager error: the settings manager token is not set.\nYou should disable the the secrets manager from the AI settings.'
        );
        apiKey = '';
      } else {
        apiKey =
          (
            await this._secretsManager.get(
              token,
              SECRETS_NAMESPACE,
              `${provider}:apiKey`
            )
          )?.value ?? '';
      }
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
   * Enhances the base system prompt with dynamic context like skills.
   * @param baseSystemPrompt The base system prompt from settings
   * @returns The enhanced system prompt with dynamic additions
   */
  private _getEnhancedSystemPrompt(
    baseSystemPrompt: string,
    tools: ToolMap
  ): string {
    let prompt = baseSystemPrompt;

    if (this._skills.length > 0) {
      const lines = this._skills.map(
        skill => `- ${skill.name}: ${skill.description}`
      );
      const skillsPrompt = `

AGENT SKILLS:
Skills are provided via the skills registry and accessed through tools (not commands).
When a skill is relevant to the user's task, activate it by calling load_skill with the skill name to load its full instructions, then follow those instructions.
If the user explicitly asks for the latest list of skills, call discover_skills (optionally with a query).
Do NOT call discover_skills just to list skills; use the preloaded snapshot below instead unless you need to verify a skill not present in the snapshot.
If the load_skill result includes a non-empty "resources" array, those are bundled files (scripts, references, templates) you MUST load before proceeding. Only load the listed resource paths; never invent resource names. For each resource path, execute load_skill again with the resource argument, e.g.: load_skill({ name: "<skill>", resource: "<path>" }). Load all listed resources before starting the task.

AVAILABLE SKILLS (preloaded snapshot):
${lines.join('\n')}
`;
      prompt += skillsPrompt;
    }

    const toolNames = new Set(Object.keys(tools));
    const hasBrowserFetch = toolNames.has('browser_fetch');
    const hasWebFetch = toolNames.has('web_fetch');
    const hasWebSearch = toolNames.has('web_search');

    if (hasBrowserFetch || hasWebFetch || hasWebSearch) {
      const webRetrievalPrompt = `

WEB RETRIEVAL POLICY:
- If the user asks about a specific URL and browser_fetch is available, call browser_fetch first for that URL.
- If browser_fetch fails due to CORS/network/access, try web_fetch (if available) for that same URL.
- If web_fetch fails with access/policy errors (for example: url_not_accessible or url_not_allowed) and browser_fetch is available, you MUST call browser_fetch for that same URL before searching.
- If either fetch method fails with temporary access/network issues (for example: network_or_cors), try the other fetch method if available before searching.
- Only fall back to web_search after both fetch methods fail or are unavailable.
- If the user explicitly asks to inspect one exact URL, do not skip directly to search unless both fetch methods fail or are unavailable.
- In your final response, state which retrieval method succeeded (browser_fetch, web_fetch, or web_search) and mention relevant limitations.
`;
      prompt += webRetrievalPrompt;
    }

    return prompt;
  }

  /**
   * Build an instruction line describing MIME types supported by this session.
   */
  private _getSupportedMimeTypesInstruction(): string {
    const mimeTypes = this._renderMimeRegistry?.mimeTypes ?? [];
    const safeMimeTypes = mimeTypes.filter(mimeType => {
      const factory = this._renderMimeRegistry?.getFactory(mimeType);
      return !!factory?.safe;
    });

    if (safeMimeTypes.length === 0) {
      return 'Supported MIME types are determined by the active JupyterLab renderers in this session.';
    }

    return `Supported MIME types in this session: ${safeMimeTypes.join(', ')}`;
  }

  // Private attributes
  private _settingsModel: IAISettingsModel;
  private _toolRegistry?: IToolRegistry;
  private _providerRegistry?: IProviderRegistry;
  private _skillRegistry?: ISkillRegistry;
  private _secretsManager?: ISecretsManager;
  private _selectedToolNames: string[];
  private _agent: ToolLoopAgent<never, ToolMap> | null;
  private _history: ModelMessage[];
  private _mcpTools: ToolMap;
  private _controller: AbortController | null;
  private _agentEvent: Signal<this, IAgentManager.IAgentEvent>;
  private _tokenUsage: ITokenUsage;
  private _tokenUsageChanged: Signal<this, ITokenUsage>;
  private _activeProvider: string = '';
  private _activeProviderChanged = new Signal<this, string | undefined>(this);
  private _skills: ISkillSummary[];
  private _renderMimeRegistry?: IRenderMimeRegistry;
  private _initQueue: Promise<void> = Promise.resolve();
  private _agentConfig: IAgentConfig | null;
  private _pendingApprovals: Map<
    string,
    { resolve: (approved: boolean, reason?: string) => void }
  > = new Map();
  private _streaming: PromiseDelegate<void> = new PromiseDelegate();
}

namespace Private {
  /**
   * Sanitize the messages before adding them to the history.
   *
   * 1- Make sure the message sequence is not altered:
   *   - tool-call messages should have a corresponding tool-result (and vice-versa)
   *   - tool-approval-request should have a tool-approval-response (and vice-versa)
   *
   * 2- Keep only serializable messages by doing a JSON round-trip.
   *    Messages that cannot be serialized are dropped.
   */
  export const sanitizeModelMessages = (
    messages: ModelMessage[]
  ): ModelMessage[] => {
    const sanitized: ModelMessage[] = [];
    for (const message of messages) {
      if (message.role === 'assistant') {
        let newMessage: AssistantModelMessage | undefined;
        if (!Array.isArray(message.content)) {
          newMessage = message;
        } else {
          // Remove assistant message content without a required response.
          const newContent: typeof message.content = [];
          for (const assistantContent of message.content) {
            let isContentValid = true;
            if (assistantContent.type === 'tool-call') {
              const toolCallId = assistantContent.toolCallId;
              isContentValid = !!messages.find(
                msg =>
                  msg.role === 'tool' &&
                  Array.isArray(msg.content) &&
                  msg.content.find(
                    content =>
                      content.type === 'tool-result' &&
                      content.toolCallId === toolCallId
                  )
              );
            } else if (assistantContent.type === 'tool-approval-request') {
              const approvalId = assistantContent.approvalId;
              isContentValid = !!messages.find(
                msg =>
                  msg.role === 'tool' &&
                  Array.isArray(msg.content) &&
                  msg.content.find(
                    content =>
                      content.type === 'tool-approval-response' &&
                      content.approvalId === approvalId
                  )
              );
            }
            if (isContentValid) {
              newContent.push(assistantContent);
            }
          }
          if (newContent.length) {
            newMessage = { ...message, content: newContent };
          }
        }
        if (newMessage) {
          try {
            sanitized.push(JSON.parse(JSON.stringify(newMessage)));
          } catch {
            // Drop messages that cannot be serialized
          }
        }
      } else if (message.role === 'tool') {
        // Remove tool message content without request.
        const newContent: typeof message.content = [];
        for (const toolContent of message.content) {
          let isContentValid = true;
          if (toolContent.type === 'tool-result') {
            const toolCallId = toolContent.toolCallId;
            isContentValid = !!sanitized.find(
              msg =>
                msg.role === 'assistant' &&
                Array.isArray(msg.content) &&
                msg.content.find(
                  content =>
                    content.type === 'tool-call' &&
                    content.toolCallId === toolCallId
                )
            );
          } else if (toolContent.type === 'tool-approval-response') {
            const approvalId = toolContent.approvalId;
            isContentValid = !!sanitized.find(
              msg =>
                msg.role === 'assistant' &&
                Array.isArray(msg.content) &&
                msg.content.find(
                  content =>
                    content.type === 'tool-approval-request' &&
                    content.approvalId === approvalId
                )
            );
          }
          if (isContentValid) {
            newContent.push(toolContent);
          }
        }
        if (newContent.length) {
          try {
            sanitized.push(
              JSON.parse(JSON.stringify({ ...message, content: newContent }))
            );
          } catch {
            // Drop messages that cannot be serialized
          }
        }
      } else {
        // Message is a system or user message.
        sanitized.push(message);
      }
    }
    return sanitized.length === messages.length ? sanitized : [];
  };

  /**
   * The token to use with the secrets manager, setter and getter.
   */
  let secretsToken: symbol | null;
  export function setToken(value: symbol | null): void {
    secretsToken = value;
  }
  export function getToken(): symbol | null {
    return secretsToken;
  }
}
