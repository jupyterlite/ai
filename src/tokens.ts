import { Token } from '@lumino/coreutils';
import { ISignal } from '@lumino/signaling';
import { FunctionTool } from '@openai/agents';
import { LanguageModel } from 'ai';
import { AgentManager } from './agent';
import type { AISettingsModel } from './models/settings-model';
import type { IModelOptions } from './providers/models';

/**
 * Type definition for a tool
 */
export type ITool = FunctionTool<any, any, any>;

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
}

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
  '@jupyterlite/ai:tool-registry',
  'Tool registry for AI agent functionality'
);

/**
 * Token for the chat provider registry.
 */
export const IChatProviderRegistry = new Token<IChatProviderRegistry>(
  '@jupyterlite/ai:chat-provider-registry',
  'Registry for chat AI providers'
);

/**
 * Token for the completion provider registry.
 */
export const ICompletionProviderRegistry =
  new Token<ICompletionProviderRegistry>(
    '@jupyterlite/ai:completion-provider-registry',
    'Registry for completion providers'
  );

/**
 * Interface for a provider factory function that creates chat models
 */
export interface IChatProviderFactory {
  (options: IModelOptions): any; // Returns the model instance for @openai/agents
}

/**
 * Interface for a provider factory function that creates completion models
 */
export interface ICompletionProviderFactory {
  (options: IModelOptions): LanguageModel;
}

/**
 * Base information about a registered provider
 */
export interface IBaseProviderInfo {
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
   * Additional provider-specific configuration schema
   */
  customSettings?: Record<string, any>;
}

/**
 * Information about a chat provider
 */
export interface IChatProviderInfo extends IBaseProviderInfo {
  /**
   * Factory function for creating chat models
   */
  factory: IChatProviderFactory;
}

/**
 * Information about a completion provider
 */
export interface ICompletionProviderInfo extends IBaseProviderInfo {
  /**
   * Factory function for creating completion models
   */
  factory: ICompletionProviderFactory;
}

/**
 * Registry for chat AI providers
 */
export interface IChatProviderRegistry {
  /**
   * The registered providers as a record (id -> info mapping).
   */
  readonly providers: Record<string, IChatProviderInfo>;

  /**
   * A signal triggered when providers have changed.
   */
  readonly providersChanged: ISignal<IChatProviderRegistry, void>;

  /**
   * Register a new chat provider.
   */
  registerProvider(info: IChatProviderInfo): void;

  /**
   * Unregister a chat provider.
   */
  unregisterProvider(id: string): boolean;

  /**
   * Get provider info by id.
   */
  getProviderInfo(id: string): IChatProviderInfo | null;

  /**
   * Create a chat model instance for the given provider.
   */
  createChatModel(id: string, options: IModelOptions): any | null;

  /**
   * Get all available provider IDs.
   */
  getAvailableProviders(): string[];
}

/**
 * Registry for completion providers
 */
export interface ICompletionProviderRegistry {
  /**
   * The registered providers as a record (id -> info mapping).
   */
  readonly providers: Record<string, ICompletionProviderInfo>;

  /**
   * A signal triggered when providers have changed.
   */
  readonly providersChanged: ISignal<ICompletionProviderRegistry, void>;

  /**
   * Register a new completion provider.
   */
  registerProvider(info: ICompletionProviderInfo): void;

  /**
   * Unregister a completion provider.
   */
  unregisterProvider(id: string): boolean;

  /**
   * Get provider info by id.
   */
  getProviderInfo(id: string): ICompletionProviderInfo | null;

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
 * Token for the AI settings model.
 */
export const IAISettingsModel = new Token<AISettingsModel>(
  '@jupyterlite/ai:IAISettingsModel'
);

/**
 * Token for the agent manager.
 */
export const IAgentManager = new Token<AgentManager>(
  '@jupyterlite/ai:agent-manager'
);

/**
 * The string that replaces a secret key in settings.
 */
export const SECRETS_NAMESPACE = '@jupyterlite/ai:providers';
export const SECRETS_REPLACEMENT = '***';
