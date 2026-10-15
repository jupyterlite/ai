import { IChatModel, IUser } from '@jupyter/chat';
import { IDocumentManager } from '@jupyterlab/docmanager';
import type {
  IPersonaKitSettings,
  ISkillRegistry,
  IToolRegistry
} from '@jupyter-ai/persona-kit';
import { VDomRenderer } from '@jupyterlab/apputils';
import { IRenderMimeRegistry } from '@jupyterlab/rendermime';
import { Token } from '@lumino/coreutils';
import { ISignal } from '@lumino/signaling';
import type { LanguageModel, ModelMessage, Tool, UserContent } from 'ai';
import { ISecretsManager } from 'jupyter-secrets-manager';

import { AI_AVATAR } from './icons';
import type { IModelOptions } from './providers/models';

/**
 * A map of AI SDK tools.
 */
export type ToolMap = Record<string, Tool>;

export const DEFAULT_PERSONA: IUser = {
  username: 'jupyternaut-frontend',
  display_name: 'Jupyternaut',
  initials: 'JF',
  color: '#2196F3',
  avatar_url: AI_AVATAR,
  bot: true,
  mention_name: 'jupyternaut-frontend'
};

/**
 * Command IDs namespace
 */
export namespace CommandIds {
  export const openSettings = '@jupyter-ai/jupyternaut:open-settings';
}

/**
 * Public interface for a persona handler attached to a chat session.
 *
 * A persona handler links an `IAgentManager` to an `IChatModel`, listening for
 * persona mentions and generating AI responses. Third-party extensions can
 * consume `IPersonaHandlerRegistry` to obtain `IPersonaHandler` instances and
 * interact with the agent (e.g. to read the active provider or update tools).
 */
export interface IPersona {
  /**
   * The agent manager used by this handler to generate AI responses.
   */
  readonly agentManager: IAgentManager;
  /**
   * The chat model this handler is attached to.
   */
  readonly model: IChatModel;
  /**
   * Whether the persona is currently generating a response.
   */
  readonly isBusy: boolean;
  /**
   * A signal emitted when the busy state changes.
   */
  readonly busyChanged: ISignal<IPersona, boolean>;
  /**
   * Whether a mention is required to trigger a response.
   * When false, the persona responds to all non-bot messages.
   * Defaults to true.
   */
  requireMention: boolean;
  /**
   * Dispose of the handler and release its resources.
   */
  dispose(): void;
  /**
   * Rebuilds the agent history from the current chat messages.
   * Called after restoring a saved chat.
   */
  rebuildHistory(): Promise<void>;
  /**
   * Adds an assistant message to the chat (used by chat commands).
   */
  sendSystemMessage(body: string): void;
}

/**
 * Registry mapping chat models to their persona.
 *
 * Provided by `@jupyter-ai/jupyternaut`. Other extensions can consume this token to
 * access the agent manager associated with a given chat.
 */
export interface IPersonaRegistry {
  /**
   * Returns the persona registered for a given chat model, if any.
   */
  get(model: IChatModel): IPersona | undefined;
  /**
   * Registers a persona for a given chat model.
   */
  register(model: IChatModel, agentManager: IAgentManager): void;
  /**
   * Removes the persona registered for a given chat model.
   */
  unregister(model: IChatModel): void;
  /**
   * A signal emitting whenever a new persona is registered.
   */
  readonly personaAdded: ISignal<IPersonaRegistry, IPersona>;
}

/**
 * The options to build a persona registry.
 */
export interface IPersonaRegistryOptions {
  /**
   * The persona used by the registry.
   */
  persona: IUser;
  /**
   * The agent settings model, used to process attachments in persona.
   */
  settingsModel: IAISettingsModel;
  /**
   * The persona kit settings, used to render command outputs in the chat.
   */
  kitSettings: IPersonaKitSettings;
  /**
   * The optional provider registry, used to process attachments in persona.
   */
  providerRegistry?: IProviderRegistry;
  /**
   * The optional document manager, used to process attachments in persona.
   */
  documentManager?: IDocumentManager;
}

export const IPersonaRegistry = new Token<IPersonaRegistry>(
  '@jupyter-ai/jupyternaut:IPersonaRegistry'
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
  /**
   * Whether the model supports image inputs.
   */
  supportsImages?: boolean;
  /**
   * Whether the model supports PDF inputs.
   */
  supportsPdf?: boolean;
  /**
   * Whether the model supports audio inputs.
   */
  supportsAudio?: boolean;
}

/**
 * The options to connect the account of the user to a provider.
 */
export interface IConnectAccountOptions {
  /**
   * The provider configuration to save with the new API key.
   */
  config: Omit<IProviderConfig, 'id'>;
  /**
   * The ID of the provider configuration to update, if there is one.
   */
  providerId?: string;
  /**
   * The signal to cancel the connection, for example when the dialog closes.
   */
  signal?: AbortSignal;
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
   * Optional function to fetch the list of available models.
   * The default models are the fallback when it fails.
   */
  fetchModels?: () => Promise<string[]>;

  /**
   * Optional function to get an API key from the account of the user.
   * The provider dialog shows a connect button when it is defined. The
   * function saves the provider configuration with the new API key, and
   * resolves to false if the connection did not complete.
   */
  connectAccount?: (options: IConnectAccountOptions) => Promise<boolean>;

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
   * Optional provider-specific options to apply to cacheable prompts and tools.
   */
  cacheProviderOptions?: NonNullable<ModelMessage['providerOptions']>;

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
  '@jupyter-ai/jupyternaut:IProviderRegistry',
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
  [key: string]: any; // Index signature for settings compatibility
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
  // Global settings
  systemPrompt: string;
  completionSystemPrompt: string;
  toolsEnabled: boolean;
}

/**
 * Interface for the AI settings model.
 * Extends VDomRenderer.IModel to support state change notifications.
 */
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
  '@jupyter-ai/jupyternaut:IAISettingsModel'
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
     * The persona kit settings, for the commands that require an approval.
     */
    kitSettings?: IPersonaKitSettings;

    /**
     * The active provider to use with this agent.
     */
    activeProvider?: string;

    /**
     * Initial token usage.
     */
    tokenUsage?: ITokenUsage;

    /**
     * Optional render mime registry for discovering supported MIME types.
     */
    renderMimeRegistry?: IRenderMimeRegistry;

    /**
     * Extra instructions appended to the system prompt of this agent.
     */
    additionalInstructions?: string;
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
      title?: string;
      input: string;
    };
    tool_call_complete: {
      callId: string;
      toolName: string;
      outputData: unknown;
      isError: boolean;
    };
    tool_approval_request: {
      toolCallId: string;
      toolName: string;
      args: unknown;
    };
    tool_approval_resolved: {
      toolCallId: string;
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
  readonly activeProvider: string;
  setActiveProvider(provider: string): Promise<void>;
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
   * Sets the history from already-processed model messages.
   * @param messages Pre-built model messages (may include binary content)
   */
  setHistory(messages: ModelMessage[]): void;
  /**
   * Stops the current streaming response by aborting the request.
   */
  stopStreaming(): void;
  /**
   * Approves a pending tool call.
   * @param toolCallId The tool call ID to approve
   * @param reason Optional reason for approval
   */
  approveToolCall(toolCallId: string, reason?: string): void;
  /**
   * Rejects a pending tool call.
   * @param toolCallId The tool call ID to reject
   * @param reason Optional reason for rejection
   */
  rejectToolCall(toolCallId: string, reason?: string): void;
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
  '@jupyter-ai/jupyternaut:IAgentManagerFactory'
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
 * The secrets namespace of the provider API keys, and the id of the plugin
 * that signs it. Kept from the old package name: the keys of users are stored
 * under it.
 */
export const SECRETS_NAMESPACE = '@jupyternaut/agent:providers';
/**
 * The string that replaces a secret key in settings.
 */
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
