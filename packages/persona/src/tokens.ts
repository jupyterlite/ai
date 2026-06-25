import { IChatModel, IUser } from '@jupyter/chat';
import type { IAgentManager } from '@jupyternaut/agent';
import { AI_AVATAR } from '@jupyternaut/agent';
import { Token } from '@lumino/coreutils';
import { ISignal } from '@lumino/signaling';

export const PERSONA: IUser = {
  username: 'jupyternaut-frontend',
  display_name: 'Jupyternaut',
  initials: 'JF',
  color: '#2196F3',
  avatar_url: AI_AVATAR,
  bot: true,
  mention_name: 'jupyternaut-frontend'
};

export const PERSONA_MENTION = `@${PERSONA.mention_name}`;

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
   * Dispose of the handler and release its resources.
   */
  dispose(): void;
}

/**
 * Registry mapping chat models to their persona.
 *
 * Provided by `@jupyternaut/persona`. Other extensions (e.g. `@jupyterlite/ai`)
 * can consume this token to access the agent manager associated with a given chat.
 */
export interface IPersonaRegistry {
  /**
   * Returns the handler registered for a given chat model, if any.
   */
  get(model: IChatModel): IPersona | undefined;
  /**
   * Registers a handler for a given chat model.
   */
  register(model: IChatModel, handler: IPersona): void;
  /**
   * Removes the handler registered for a given chat model.
   */
  unregister(model: IChatModel): void;
  /**
   * A signal emitting whenever a new handler is registered.
   */
  readonly personaAdded: ISignal<IPersonaRegistry, IPersona>;
}

export const IPersonaRegistry = new Token<IPersonaRegistry>(
  '@jupyternaut/persona:IPersonaHandlerRegistry'
);
