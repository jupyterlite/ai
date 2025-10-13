import { Token } from '@lumino/coreutils';
import { ISignal } from '@lumino/signaling';
import { FunctionTool, Model } from '@openai/agents';
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
 * Token for the provider registry.
 */
export const IProviderRegistry = new Token<IProviderRegistry>(
  '@jupyterlite/ai:provider-registry',
  'Registry for AI providers'
);

/**
 * Interface for a provider factory function that creates chat models
 */
export interface IChatProviderFactory {
  (options: IModelOptions): Model;
}

/**
 * Interface for a provider factory function that creates completion models
 */
export interface ICompletionProviderFactory {
  (options: IModelOptions): LanguageModel;
}

/**
 * Provider information
 */
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
   * Factory function for creating chat models
   */
  chatFactory: IChatProviderFactory;

  /**
   * Factory function for creating completion models
   */
  completionFactory: ICompletionProviderFactory;

  /**
   * Completion-specific configuration (provider-specific functions only)
   * Note: temperature, supportsFillInMiddle, and useFilterText are now
   * configured via settings instead of per-provider.
   */
  completionConfig?: {
    customPromptFormat?: (prompt: string, suffix: string) => string;
    cleanupCompletion?: (completion: string) => string;
  };
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
  createChatModel(id: string, options: IModelOptions): Model | null;

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
