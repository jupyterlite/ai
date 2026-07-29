import { IChatModel, IUser } from '@jupyter/chat';
import { IDocumentManager } from '@jupyterlab/docmanager';
import type {
  IAgentManager,
  IAISettingsModel,
  IProviderRegistry
} from '@jupyternaut/agent';
import { AI_AVATAR } from '@jupyternaut/agent';
import { Token } from '@lumino/coreutils';
import { ISignal } from '@lumino/signaling';

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
  export const openSettings = '@jupyternaut/persona:open-settings';
  export const refreshSkills = '@jupyternaut/persona:refresh-skills';
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
}

/**
 * Registry mapping chat models to their persona.
 *
 * Provided by `@jupyternaut/persona`. Other extensions (e.g. `@jupyterlite/ai`)
 * can consume this token to access the agent manager associated with a given chat.
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
   * The optional provider registry, used to process attachments in persona.
   */
  providerRegistry?: IProviderRegistry;
  /**
   * The optional document manager, used to process attachments in persona.
   */
  documentManager?: IDocumentManager;
}

export const IPersonaRegistry = new Token<IPersonaRegistry>(
  '@jupyternaut/persona:IPersonaHandlerRegistry'
);
