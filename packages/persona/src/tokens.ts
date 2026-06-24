import { IChatModel, IUser } from '@jupyter/chat';
import { AI_AVATAR } from '@jupyternaut/agent';
import { Token } from '@lumino/coreutils';
import { ISignal } from '@lumino/signaling';
import type { PersonaHandler } from './persona-handler';

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
 * Registry mapping chat models to their persona handlers.
 *
 * Provided by `@jupyternaut/persona`. Other extensions (e.g. `@jupyterlite/ai`)
 * can consume this token to access the agent manager associated with a given chat.
 */
export interface IPersonaHandlerRegistry {
  /**
   * Returns the handler registered for a given chat model, if any.
   */
  get(model: IChatModel): PersonaHandler | undefined;
  /**
   * Registers a handler for a given chat model.
   */
  register(model: IChatModel, handler: PersonaHandler): void;
  /**
   * Removes the handler registered for a given chat model.
   */
  unregister(model: IChatModel): void;
  /**
   * A signal emitting whenever a new handler is registered.
   */
  readonly handlerAdded: ISignal<IPersonaHandlerRegistry, PersonaHandler>;
}

export const IPersonaHandlerRegistry = new Token<IPersonaHandlerRegistry>(
  '@jupyternaut/persona:IPersonaHandlerRegistry'
);
