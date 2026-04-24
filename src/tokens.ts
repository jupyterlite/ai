import { ActiveCellManager, IMessage, IMessageContent } from '@jupyter/chat';
import { VDomRenderer } from '@jupyterlab/apputils';
import { IRenderMimeRegistry } from '@jupyterlab/rendermime';
import { Token } from '@lumino/coreutils';
import type { IDisposable } from '@lumino/disposable';
import { ISignal } from '@lumino/signaling';
import type { Tool, LanguageModel, UserContent, ModelMessage } from 'ai';
import { ISecretsManager } from 'jupyter-secrets-manager';

import type { IModelOptions } from './providers/models';
import { AIChatModel } from './chat-model';
import type {
  ISkillDefinition,
  ISkillRegistration,
  ISkillResourceResult,
  ISkillSummary
} from './skills/types';

export type {
  ISkillDefinition,
  ISkillRegistration,
  ISkillResourceResult,
  ISkillSummary
} from './skills/types';

/**
 * Command IDs namespace
 */
export namespace CommandIds {
  export const openSettings = '@jupyterlite/ai:open-settings';
  export const reposition = '@jupyterlite/ai:reposition';
  export const openChat = '@jupyterlite/ai:open-chat';
  export const openOrRevealChat = '@jupyterlite/ai:open-or-reveal-chat';
  export const moveChat = '@jupyterlite/ai:move-chat';
  export const refreshSkills = '@jupyterlite/ai:refresh-skills';
  export const saveChat = '@jupyterlite/ai:save-chat';
  export const restoreChat = '@jupyterlite/ai:restore-chat';
}

/* THE TOOL REGISTRY */
/**
 * Type definition for a tool
 */
export type ITool = Tool;

/**
 * A map containing tools.
 */
export type ToolMap = Record<string, ITool>;

/**
 * Interface for a named tool (tool with a name identifier)
 */
export interface INamedTool {
  /**
   * The unique name of the tool
   */
  name: string;
  /**
   * The tool instance
   */
  tool: ITool;
}

/**
 * The tool registry interface for managing AI tools
 */
export interface IToolRegistry {
  /**
   * The registered tools as a record (name -> tool mapping).
   */
  readonly tools: Record<string, ITool>;

  /**
   * The registered named tools array.
   */
  readonly namedTools: INamedTool[];

  /**
   * A signal triggered when the tools have changed.
   */
  readonly toolsChanged: ISignal<IToolRegistry, void>;

  /**
   * Add a new tool to the registry.
   */
  add(name: string, tool: ITool): void;

  /**
   * Get a tool for a given name.
   * Return null if the name is not provided or if there is no registered tool with the
   * given name.
   */
  get(name: string | null): ITool | null;

  /**
   * Remove a tool from the registry by name.
   */
  remove(name: string): boolean;
}

/**
 * The tool registry token.
 */
export const IToolRegistry = new Token<IToolRegistry>(
  '@jupyterlite/ai:IToolRegistry',
  'Tool registry for AI agent functionality'
);

/* THE SKILL REGISTRY */

/**
 * Registry for skills available to the AI agent.
 */
export interface ISkillRegistry {
  /**
   * Signal emitted when skills change.
   */
  readonly skillsChanged: ISignal<ISkillRegistry, void>;

  /**
   * Register a single skill.
   */
  registerSkill(skill: ISkillRegistration): IDisposable;

  /**
   * List all skills with summary info, optionally filtered by a search query.
   */
  listSkills(query?: string): ISkillSummary[];

  /**
   * Get a full skill definition by name.
   */
  getSkill(name: string): ISkillDefinition | null;

  /**
   * Load a resource for a skill.
   */
  getSkillResource(
    name: string,
    resource: string
  ): Promise<ISkillResourceResult>;
}

/**
 * The skill registry token.
 */
export const ISkillRegistry = new Token<ISkillRegistry>(
  '@jupyterlite/ai:ISkillRegistry',
  'Skill registry for AI agent functionality'
);

/* THE LLM PROVIDER REGISTRY */

/**
 * Interface for a provider factory function that creates language models
 */
export interface IProviderFactory {
  (options: IModelOptions): LanguageModel;
}

/**
 * Built-in web search integration families supported by provider tools.
 */
export type IProviderWebSearchImplementation = 'openai' | 'anthropic';

/**
 * Built-in web fetch integration families supported by provider tools.
 */
export type IProviderWebFetchImplementation = 'anthropic';

/**
 * Capability descriptor for provider-hosted web search.
 */
export interface IProviderWebSearchCapability {
  /**
   * Which built-in integration family to use.
   */
  implementation: IProviderWebSearchImplementation;

  /**
   * If true, skip provider-hosted web search when function tools are enabled.
   */
  requiresNoFunctionTools?: boolean;
}

/**
 * Capability descriptor for provider-hosted web fetch.
 */
export interface IProviderWebFetchCapability {
  /**
   * Which built-in integration family to use.
   */
  implementation: IProviderWebFetchImplementation;
}

/**
 * Provider-hosted tool capabilities exposed by a provider.
 */
export interface IProviderToolCapabilities {
  webSearch?: IProviderWebSearchCapability;
  webFetch?: IProviderWebFetchCapability;
}

/**
 * Provider information
 */
export interface IProviderModelInfo {
  /**
   * Default context window for the model in tokens.
   */
  contextWindow?: number;
}

export interface IProviderInfo {
  /**
   * Unique identifier for the provider
   */
  id: string;

  /**
   * Display name for the provider
   */
  name: string;

  /**
   * API key requirement policy for this provider
   * - 'required': API key is mandatory
   * - 'optional': API key is optional
   * - 'none': API key is not needed and field will be hidden
   */
  apiKeyRequirement: 'required' | 'optional' | 'none';

  /**
   * Default model names for this provider
   */
  defaultModels: string[];

  /**
   * Optional per-model metadata keyed by model ID.
   */
  modelInfo?: Record<string, IProviderModelInfo>;

  /**
   * Whether this provider supports custom base URLs
   */
  supportsBaseURL?: boolean;

  /**
   * Whether this provider supports custom headers
   */
  supportsHeaders?: boolean;

  /**
   * Whether this provider supports tool calling
   */
  supportsToolCalling?: boolean;

  /**
   * Optional description shown in the UI
   */
  description?: string;

  /**
   * Optional URL suggestions
   */
  baseUrls?: { url: string; description?: string }[];

  /**
   * Optional provider-hosted tool capabilities for web retrieval.
   */
  providerToolCapabilities?: IProviderToolCapabilities;

  /**
   * Factory function for creating language models
   */
  factory: IProviderFactory;
}

/**
 * Registry for AI providers
 */
export interface IProviderRegistry {
  /**
   * The registered providers as a record (id -> info mapping).
   */
  readonly providers: Record<string, IProviderInfo>;

  /**
   * A signal triggered when providers have changed.
   */
  readonly providersChanged: ISignal<IProviderRegistry, void>;

  /**
   * Register a new provider.
   */
  registerProvider(info: IProviderInfo): void;

  /**
   * Get provider info by id.
   */
  getProviderInfo(id: string): IProviderInfo | null;

  /**
   * Create a chat model instance for the given provider.
   */
  createChatModel(id: string, options: IModelOptions): LanguageModel | null;

  /**
   * Create a completion model instance for the given provider.
   */
  createCompletionModel(
    id: string,
    options: IModelOptions
  ): LanguageModel | null;

  /**
   * Get all available provider IDs.
   */
  getAvailableProviders(): string[];
}

/**
 * Token for the provider registry.
 */
export const IProviderRegistry = new Token<IProviderRegistry>(
  '@jupyterlite/ai:IProviderRegistry',
  'Registry for AI providers'
);

/* THE SETTINGS MODEL */

export interface IProviderParameters {
  temperature?: number;
  maxOutputTokens?: number;
  maxTurns?: number;
  contextWindow?: number;
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
  // Context usage display setting
  showContextUsage: boolean;
  // Commands that require approval before execution
  commandsRequiringApproval: string[];
  // Commands whose execute_command outputs may auto-render MIME bundles in chat
  commandsAutoRenderMimeBundles: string[];
  // MIME types that are trusted when auto-rendering execute_command outputs
  trustedMimeTypesForAutoRender: string[];
  // Diff display settings
  showCellDiff: boolean;
  showFileDiff: boolean;
  diffDisplayMode: 'split' | 'unified';
  // Paths to directories containing agent skills
  skillsPaths: string[];
  // Directory where chat backups are saved
  chatBackupDirectory: string;
}

export interface IAISettingsModel extends VDomRenderer.IModel {
  readonly config: IAIConfig;
  updateConfig(updates: Partial<IAIConfig>): Promise<void>;
  readonly providers: IProviderConfig[];
  getProvider(id: string): IProviderConfig | undefined;
  getDefaultProvider(): IProviderConfig | undefined;
  getCompleterProvider(): IProviderConfig | undefined;
  addProvider(providerConfig: Omit<IProviderConfig, 'id'>): Promise<string>;
  removeProvider(id: string): Promise<void>;
  updateProvider(id: string, updates: Partial<IProviderConfig>): Promise<void>;
  setActiveProvider(id: string): Promise<void>;
  setActiveCompleterProvider(id: string | undefined): Promise<void>;
  readonly mcpServers: IMCPServerConfig[];
  getMCPServer(id: string): IMCPServerConfig | undefined;
  addMCPServer(serverConfig: Omit<IMCPServerConfig, 'id'>): Promise<string>;
  removeMCPServer(id: string): Promise<void>;
  updateMCPServer(
    id: string,
    updates: Partial<IMCPServerConfig>
  ): Promise<void>;
  /**
   * Get the API key saved in the settings file for a given provider.
   *
   * @param id - the id of the provider.
   */
  getApiKey(id: string): string;
}

/**
 * Token for the AI settings model.
 */
export const IAISettingsModel = new Token<IAISettingsModel>(
  '@jupyterlite/ai:IAISettingsModel'
);

/* THE AGENT MANAGER */

/**
 * A namespace for agent manager.
 */
export namespace IAgentManager {
  /**
   * Configuration options for the AgentManager
   */
  export interface IOptions {
    /**
     * AI settings model for configuration
     */
    settingsModel: IAISettingsModel;

    /**
     * Optional tool registry for managing available tools
     */
    toolRegistry?: IToolRegistry;

    /**
     * Optional provider registry for model creation
     */
    providerRegistry?: IProviderRegistry;

    /**
     * The skill registry for discovering skills.
     */
    skillRegistry?: ISkillRegistry;

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

    /**
     * JupyterLab render mime registry for discovering supported MIME types.
     */
    renderMimeRegistry?: IRenderMimeRegistry;
  }

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
      outputData: unknown;
      isError: boolean;
    };
    tool_approval_request: {
      approvalId: string;
      toolCallId: string;
      toolName: string;
      args: unknown;
    };
    tool_approval_resolved: {
      approvalId: string;
      approved: boolean;
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
}

export interface IAgentManager {
  /**
   * The active provider for this agent.
   */
  activeProvider: string;
  /**
   * Signal emitted when agent events occur
   */
  readonly agentEvent: ISignal<IAgentManager, IAgentManager.IAgentEvent>;
  /**
   * Signal emitted when the active provider has changed.
   */
  readonly activeProviderChanged: ISignal<IAgentManager, string | undefined>;
  /**
   * Gets the current token usage statistics.
   */
  readonly tokenUsage: ITokenUsage;
  /**
   * Signal emitted when token usage statistics change.
   */
  readonly tokenUsageChanged: ISignal<IAgentManager, ITokenUsage>;
  /**
   * Refresh the skills snapshot and rebuild the agent if resources are ready.
   */
  refreshSkills(): void;
  /**
   * Sets the selected tools by name and reinitializes the agent.
   * @param toolNames Array of tool names to select
   */
  setSelectedTools(toolNames: string[]): void;
  /**
   * Gets the currently selected tools as a record.
   * @returns Record of selected tools
   */
  readonly selectedAgentTools: ToolMap;
  /**
   * Checks if the current configuration is valid for agent operations.
   * Uses the provider registry to determine if an API key is required.
   * @returns True if the configuration is valid, false otherwise
   */
  hasValidConfig(): boolean;
  /**
   * Clears conversation history and resets agent state.
   */
  clearHistory(): Promise<void>;
  /**
   * Sets the conversation history with a list of messages from the chat.
   * @param messages The chat messages to set as history
   */
  setHistory(messages: IMessageContent[]): void;
  /**
   * Stops the current streaming response by aborting the request.
   */
  stopStreaming(): void;
  /**
   * Approves a pending tool call.
   * @param approvalId The approval ID to approve
   * @param reason Optional reason for approval
   */
  approveToolCall(approvalId: string, reason?: string): void;
  /**
   * Rejects a pending tool call.
   * @param approvalId The approval ID to reject
   * @param reason Optional reason for rejection
   */
  rejectToolCall(approvalId: string, reason?: string): void;
  /**
   * Generates AI response to user message using the agent.
   * Handles the complete execution cycle including tool calls.
   * @param message The user message to respond to (may include processed attachment content)
   */
  generateResponse(message: UserContent): Promise<void>;
  /**
   * Create a transient language model to request a text response, which won't be added to history.
   * @param messages - the messages sequence to send to the model.
   */
  textResponse(messages: ModelMessage[]): Promise<string>;
  /**
   * Initializes the AI agent with current settings and tools.
   * Sets up the agent with model configuration, tools, and MCP tools.
   */
  initializeAgent(mcpTools?: ToolMap): Promise<void>;
}

/**
 * Token for the agent manager.
 */
export const IAgentManager = new Token<IAgentManager>(
  '@jupyterlite/ai:IAgentManager'
);

/* The AGENT MANAGER FACTORY */
/**
 * The interface for a agent manager factory.
 */
export interface IAgentManagerFactory {
  /**
   * Create a new agent.
   */
  createAgent(options: IAgentManager.IOptions): IAgentManager;
  /**
   * Signal emitted when MCP connection status changes
   */
  readonly mcpConnectionChanged: ISignal<IAgentManagerFactory, boolean>;
  /**
   * Checks whether a specific MCP server is connected.
   * @param serverName The name of the MCP server to check
   * @returns True if the server is connected, false otherwise
   */
  isMCPServerConnected(serverName: string): boolean;
  /**
   * Gets the MCP tools from connected servers
   */
  getMCPTools(): Promise<ToolMap>;
}

/*
 * Token for the agent manager factory.
 */
export const IAgentManagerFactory = new Token<IAgentManagerFactory>(
  '@jupyterlite/ai:IAgentManagerFactory'
);

/* THE CHAT MODELS HANDLER */

/**
 * The interface for the chat model handler.
 */
export interface IChatModelHandler {
  /**
   * The function to create a new model.
   */
  createModel(options: ICreateChatOptions): AIChatModel;
  /**
   * The active cell manager (to copy code from chat to cell).
   */
  activeCellManager: ActiveCellManager | undefined;
}

export interface ICreateChatOptions {
  /**
   * The name of the chat.
   */
  name: string;
  /**
   * The id of the active provider of the chat.
   */
  activeProvider: string;
  /**
   * The current token usage in this chat.
   */
  tokenUsage?: ITokenUsage;
  /**
   * The messages to ad by default.
   */
  messages?: IMessage[];
  /**
   * Whether the chat is autosaved or not.
   */
  autosave?: boolean;
  /**
   * An optional title to the chat.
   */
  title?: string | null;
}
/**
 * Token for the chat model handler.
 */
export const IChatModelHandler = new Token<IChatModelHandler>(
  '@jupyterlite/ai:IChatModelHandler'
);

/* THE DIFF MANAGER */

/**
 * Parameters for showing cell diff
 */
export interface IShowCellDiffParams {
  /**
   * Original cell content
   */
  original: string;
  /**
   * Modified cell content
   */
  modified: string;
  /**
   * Optional cell ID
   */
  cellId?: string;
  /**
   * Whether to show action buttons in the diff view
   */
  showActionButtons?: boolean;
  /**
   * Whether to open the diff view
   */
  openDiff?: boolean;
  /**
   * Optional path to the notebook
   */
  notebookPath?: string;
}

/**
 * Parameters for showing file diff
 */
export interface IShowFileDiffParams {
  /**
   * Original file content
   */
  original: string;
  /**
   * Modified file content
   */
  modified: string;
  /**
   * Optional file path
   */
  filePath?: string;
  /**
   * Whether to show action buttons in the diff view
   */
  showActionButtons?: boolean;
}

/**
 * Interface for managing diff operations
 */
export interface IDiffManager {
  /**
   * Show diff between original and modified cell content
   */
  showCellDiff(params: IShowCellDiffParams): Promise<void>;
  /**
   * Show diff between original and modified file content
   */
  showFileDiff(params: IShowFileDiffParams): Promise<void>;
}

/**
 * Token for the diff manager.
 */
export const IDiffManager = new Token<IDiffManager>(
  '@jupyterlite/ai:IDiffManager'
);

/**
 * Interface for token usage statistics from AI model interactions
 */
export interface ITokenUsage {
  /**
   * Number of input tokens consumed (prompt tokens)
   */
  inputTokens: number;

  /**
   * Number of output tokens generated (completion tokens)
   */
  outputTokens: number;

  /**
   * Estimated prompt tokens used by the most recent model request.
   * This is based on the final step of the latest request.
   */
  lastRequestInputTokens?: number;

  /**
   * Configured context window size for the active provider/model.
   */
  contextWindow?: number;
}

/**
 * The string that replaces a secret key in settings.
 */
export const SECRETS_NAMESPACE = '@jupyterlite/ai:providers';
export const SECRETS_REPLACEMENT = '***';

/**
 * Internal interface for AI provider secret access within the shared namespace.
 */
export interface IAISecretsAccess {
  /**
   * Whether secrets access is currently available.
   */
  readonly isAvailable: boolean;

  /**
   * Get a secret value by ID.
   */
  get(id: string): Promise<string | undefined>;

  /**
   * Set a secret value by ID.
   */
  set(id: string, value: string): Promise<void>;

  /**
   * Attach an input field to a secret ID.
   */
  attach(
    id: string,
    input: HTMLInputElement,
    callback?: (value: string) => void
  ): Promise<void>;
}
