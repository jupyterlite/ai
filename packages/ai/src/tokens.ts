import type {
  IAISettingsModel as IBaseAISettingsModel,
  IAgentManager,
  ITokenUsage
} from '@jupyterlite/agent';
import { ActiveCellManager, IChatModel, IMessage } from '@jupyter/chat';
import { Token } from '@lumino/coreutils';
import { ISignal } from '@lumino/signaling';

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

/* THE CHAT MODELS HANDLER */

export interface IAIChatModel extends IChatModel {
  /**
   * A signal emitting when the chat name has changed.
   */
  readonly nameChanged: ISignal<IAIChatModel, string>;
  /**
   * The title of the chat.
   */
  title: string | null;
  /**
   * A signal emitting when the chat title has changed.
   */
  readonly titleChanged: ISignal<IAIChatModel, string | null>;
  /**
   * Whether to save the chat automatically.
   */
  autosave: boolean;
  /**
   * A signal emitting when the autosave flag changed.
   */
  readonly autosaveChanged: ISignal<IAIChatModel, boolean>;
  /**
   * Whether save/restore is available.
   */
  readonly saveAvailable: boolean;
  /**
   * A signal emitting when the token usage changed.
   */
  readonly tokenUsageChanged: ISignal<IAgentManager, ITokenUsage>;
  /**
   * The agent manager used in the model.
   */
  readonly agentManager: IAgentManager;
  /**
   * Save the chat as json file.
   */
  save(): Promise<void>;
  /**
   * Restore the chat from a json file.
   *
   * @param silent - Whether a log should be displayed in the console if the
   * restoration is not possible.
   */
  restore(filepath: string, silent?: boolean): Promise<boolean>;
  /**
   * Request a title to this chat, regarding the message history.
   */
  requestTitle(): Promise<string>;
  /**
   * Removes a queued message by its ID.
   * @param messageId The ID of the queued message to remove
   */
  removeQueuedMessage(messageId: string): void;
  /**
   * Reorders queued messages by their IDs.
   * @param messageIds Array of message IDs in the desired order
   */
  reorderQueuedMessages(messageIds: string[]): void;
  /**
   * Edits a queued message by its ID.
   * @param messageId The ID of the queued message to edit
   * @param newBody The new body of the message
   */
  editQueuedMessage(messageId: string, newBody: string): void;
  /**
   * The current message queue
   */
  messageQueue: any[];
  /**
   * Whether the chat is currently busy processing a message
   */
  isBusy: boolean;
}

/**
 * The interface for the chat model handler.
 */
export interface IChatModelHandler {
  /**
   * The function to create a new model.
   */
  createModel(options: ICreateChatOptions): IAIChatModel;
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

/**
 * Interface for the AI settings model with JupyterLab-specific features.
 * Extends the base IAISettingsModel from @jupyterlite/agent which already includes VDomRenderer.IModel.
 */
export interface IAISettingsModel extends IBaseAISettingsModel {
  // Extends the base IAISettingsModel with JupyterLab-specific features
}

/**
 * Token for the AI settings model.
 */
export const IAISettingsModel = new Token<IAISettingsModel>(
  '@jupyterlite/ai:IAISettingsModel'
);
