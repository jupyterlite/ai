import {
  AbstractChatModel,
  IActiveCellManager,
  IAttachment,
  IChatContext,
  IMessageContent,
  IMimeModelBody,
  INewMessage,
  IUser
} from '@jupyter/chat';

import { PathExt } from '@jupyterlab/coreutils';

import { IDocumentManager } from '@jupyterlab/docmanager';

import { ISettingRegistry } from '@jupyterlab/settingregistry';

import { Contents } from '@jupyterlab/services';

import { AI_AVATAR } from '@jupyternaut/agent';

import type {
  IAgentManager,
  IAISettingsModel,
  ITokenUsage
} from '@jupyternaut/agent';

import { IPersona, IPersonaRegistry } from '@jupyternaut/persona';

import type { ModelMessage } from 'ai';

import { UUID } from '@lumino/coreutils';

import { Debouncer } from '@lumino/polling';

import { ISignal, Signal } from '@lumino/signaling';

import type { IAIChatModel } from './tokens';

/**
 * AI Chat Model implementation that provides chat functionality tool integration,
 * and MCP server support.
 */
export class AIChatModel extends AbstractChatModel implements IAIChatModel {
  /**
   * Constructs a new AIChatModel instance.
   * @param options Configuration options for the chat model
   */
  constructor(options: AIChatModel.IOptions) {
    super({
      activeCellManager: options.activeCellManager,
      documentManager: options.documentManager,
      config: {
        enableCodeToolbar: true,
        sendWithShiftEnter:
          options.settings?.composite['sendWithShiftEnter'] === true
      }
    });
    this._settingsModel = options.settingsModel;
    this._settings = options.settings ?? null;
    this._user = options.user;
    this._activeProvider = options.activeProvider ?? null;
    this._contentsManager = options.contentsManager;

    // Listen for settings changes to update chat behavior
    this._settings?.changed.connect(this._onSettingsChanged, this);

    this._settingsModel.stateChanged.connect(this._onModelChanged, this);

    this._autosaveDebouncer = new Debouncer(this.save, 3000);

    options.personaRegistry.personaAdded.connect(
      (_: IPersonaRegistry, persona: IPersona) => {
        if (persona.model === this) {
          this.agentManager?.activeProviderChanged.disconnect(
            this._onModelChanged,
            this
          );
          this._persona = persona;
          if (this._activeProvider && this.agentManager) {
            this.agentManager.activeProvider = this._activeProvider;
          }
          this._persona.busyChanged.connect(this._onPersonaBusyChanged, this);
          // Rebuild history when the model changes
          this.agentManager?.activeProviderChanged.connect(
            this._onModelChanged,
            this
          );
        }
      }
    );
  }

  /**
   * Override the getter/setter of the name to add a signal when renaming a chat.
   */
  get name(): string {
    return super.name;
  }
  set name(value: string) {
    super.name = value;
    this._nameChanged.emit(value);
    if (!this.messages.length) {
      const directory =
        (this._settings?.composite['chatBackupDirectory'] as
          | string
          | undefined) ?? '';
      const filepath = PathExt.join(directory, `${this.name}.chat`);
      this.restore(filepath, false);
    }
    this.setReady();
  }

  /**
   * A signal emitting when the chat name has changed.
   */
  get nameChanged(): ISignal<IAIChatModel, string> {
    return this._nameChanged;
  }

  /**
   * The title of the chat.
   */
  get title(): string | null {
    return this._title;
  }
  set title(value: string | null) {
    this._title = value;
    if (this.autosave) {
      this._autosaveDebouncer.invoke();
    }
    this._titleChanged.emit(this._title);
  }

  /**
   * A signal emitting when the chat title has changed.
   */
  get titleChanged(): ISignal<IAIChatModel, string | null> {
    return this._titleChanged;
  }

  /**
   * Whether to save the chat automatically.
   */
  get autosave(): boolean {
    return this._autosave;
  }
  set autosave(value: boolean) {
    if (value === this._autosave) {
      return;
    }
    this._autosave = value;
    this._autosaveChanged.emit(value);
    if (value) {
      this.messagesUpdated.connect(
        this._autosaveDebouncer.invoke,
        this._autosaveDebouncer
      );
      this.messageChanged.connect(
        this._autosaveDebouncer.invoke,
        this._autosaveDebouncer
      );
    } else {
      this.messagesUpdated.disconnect(
        this._autosaveDebouncer.invoke,
        this._autosaveDebouncer
      );
      this.messageChanged.disconnect(
        this._autosaveDebouncer.invoke,
        this._autosaveDebouncer
      );
    }
    this._autosaveDebouncer.invoke();
  }

  /**
   * A signal emitting when the autosave flag changed.
   */
  get autosaveChanged(): ISignal<IAIChatModel, boolean> {
    return this._autosaveChanged;
  }

  /**
   * Gets the current user information.
   */
  get user(): IUser {
    return this._user;
  }

  /**
   * A signal emitting when the token usage changed.
   */
  get tokenUsageChanged(): ISignal<IAgentManager, ITokenUsage> | null {
    return this.agentManager?.tokenUsageChanged ?? null;
  }

  /**
   * The agent manager used in the model.
   */
  get agentManager(): IAgentManager | null {
    return this._persona?.agentManager ?? null;
  }

  /**
   * Whether save/restore is available.
   */
  get saveAvailable(): boolean {
    return !!this._contentsManager;
  }

  /**
   * Dispose of the model.
   */
  dispose(): void {
    this._settings?.changed.disconnect(this._onSettingsChanged, this);
    this.stopStreaming();
    this.messagesUpdated.disconnect(
      this._autosaveDebouncer.invoke,
      this._autosaveDebouncer
    );
    super.dispose();
  }

  /**
   * Creates a chat context for the current conversation.
   */
  createChatContext(): AIChatModel.IAIChatContext {
    return {
      name: this.name,
      user: { username: 'me' },
      users: [],
      messages: this.messages,
      stopStreaming: () => this.stopStreaming(),
      clearMessages: () => this.clearMessages(),
      agentManager: this.agentManager,
      addSystemMessage: (body: string) => this._addSystemMessage(body),
      removeQueuedMessage: (id: string) => this.removeQueuedMessage(id),
      reorderQueuedMessages: (ids: string[]) => this.reorderQueuedMessages(ids),
      editQueuedMessage: (id: string, body: string) =>
        this.editQueuedMessage(id, body)
    };
  }

  /**
   * Stops the current streaming response by aborting the request.
   */
  stopStreaming = (): void => {
    this.agentManager?.stopStreaming();
  };

  /**
   * Clears all messages from the chat and resets conversation state.
   */
  clearMessages = async (): Promise<void> => {
    this.stopStreaming();
    this._messageQueue = [];
    this._queueMessageId = null;
    this.messagesDeleted(0, this.messages.length);
    this.title = null;
    await this.agentManager?.clearHistory();
  };

  /**
   * Overrides messageAdded to ensure queued messages stay at the bottom.
   */
  override messageAdded(message: IMessageContent): void {
    super.messageAdded(message);
    if (this._queueMessageId && message.id !== this._queueMessageId) {
      this._updateQueueUI();
    }
  }

  /**
   * Adds a non-user message to the chat (used by chat commands).
   */
  private _addSystemMessage(body: string): void {
    const message: IMessageContent = {
      body,
      sender: this._getAIUser(),
      id: UUID.uuid4(),
      time: Date.now() / 1000,
      type: 'msg',
      raw_time: false
    };
    this.messageAdded(message);
  }

  /**
   * Sends a message to the AI and generates a response.
   * @param message The user message to send
   */
  async sendMessage(message: INewMessage): Promise<void> {
    const hasBody = message.body.trim().length > 0;
    const hasAttachments = this.input.attachments.length > 0;
    if (!hasBody && !hasAttachments) {
      return;
    }

    // Add user message to chat
    const userMessage: IMessageContent = {
      body: message.body,
      sender: this.user || { username: 'user', display_name: 'User' },
      id: UUID.uuid4(),
      time: Date.now() / 1000,
      type: 'msg',
      raw_time: false,
      attachments: [...this.input.attachments],
      mentions: this.input.mentions
    };

    // Check if we have valid configuration
    if (!this.agentManager?.hasValidConfig()) {
      this.messageAdded(userMessage);
      const errorMessage: IMessageContent = {
        body: 'Please configure your AI settings first. Open the AI Settings to set your API key and model.',
        sender: this._getAIUser(),
        id: UUID.uuid4(),
        time: Date.now() / 1000,
        type: 'msg',
        raw_time: false
      };
      this.messageAdded(errorMessage);
      return;
    }

    if (this._persona?.isBusy) {
      this._messageQueue.push({
        id: UUID.uuid4(),
        body: message.body,
        _originalMsg: userMessage
      });
      this.input.clearAttachments();
      this.input.clearMentions();
      this._updateQueueUI();
      return;
    }

    this.messageAdded(userMessage);
    this.input.clearAttachments();
    this.input.clearMentions();
  }

  /**
   * Called when the persona's busy state changes. Drains the message queue
   * and requests an auto-title when the persona becomes free.
   */
  private async _onPersonaBusyChanged(
    _: IPersona,
    busy: boolean
  ): Promise<void> {
    if (busy) {
      return;
    }
    this._drainQueue();

    if (
      this._settings?.composite['autoTitle'] === true &&
      (this.messages.filter(msg => msg.sender.username !== 'ai-assistant')
        .length <= 5 ||
        this.title === null)
    ) {
      try {
        this.title = await this.requestTitle();
      } catch (e) {
        console.warn('Error while generating a title\n', e);
      }
    }
  }

  /**
   * Removes the message-queue chat component.
   */
  private _removeQueueUI(): void {
    if (this._queueMessageId) {
      const existingMsg = this.messages.find(
        msg => msg.id === this._queueMessageId
      );
      if (existingMsg) {
        const idx = this.messages.indexOf(existingMsg);
        if (idx !== -1) {
          this.messagesDeleted(idx, 1);
        }
      }
      this._queueMessageId = null;
    }
  }

  /**
   * Creates or updates the message-queue chat component.
   */
  private _updateQueueUI(): void {
    this._removeQueueUI();

    if (this._messageQueue.length === 0) {
      return;
    }

    const queueBody = {
      data: {
        'application/vnd.jupyter.chat.components': 'message-queue'
      },
      metadata: {
        messages: this._messageQueue.map(m => ({
          id: m.id,
          body: m.body,
          attachments: m._originalMsg.attachments
        })),
        targetId: this.name
      }
    } as IMimeModelBody;

    this._queueMessageId = UUID.uuid4();
    const queueMessage: IMessageContent = {
      body: '',
      mime_model: queueBody,
      sender: { username: 'system', display_name: '' },
      id: this._queueMessageId,
      time: Date.now() / 1000,
      type: 'msg',
      raw_time: false
    };
    this.messageAdded(queueMessage);
  }

  /**
   * Adds the next queued message to chat so the persona can respond to it.
   */
  private _drainQueue(): void {
    if (this._messageQueue.length === 0) {
      this._removeQueueUI();
      return;
    }

    const next = this._messageQueue.shift()!;
    next._originalMsg.time = Date.now() / 1000;
    this._updateQueueUI();
    this.messageAdded(next._originalMsg);
  }

  /**
   * Removes a queued message by its ID.
   * @param messageId The ID of the queued message to remove
   */
  removeQueuedMessage(messageId: string): void {
    this.messageQueue = this._messageQueue.filter(msg => msg.id !== messageId);
  }

  /**
   * Reorders queued messages by their IDs.
   * @param messageIds Array of message IDs in the desired order
   */
  reorderQueuedMessages(messageIds: string[]): void {
    const byId = new Map(this._messageQueue.map(m => [m.id, m]));
    this.messageQueue = messageIds
      .map(id => byId.get(id))
      .filter((m): m is Private.IQueuedItem => m !== undefined);
  }

  /**
   * Edits a queued message by its ID.
   * @param messageId The ID of the queued message to edit
   * @param newBody The new body of the message
   */
  editQueuedMessage(messageId: string, newBody: string): void {
    const queue = [...this._messageQueue];
    const index = queue.findIndex(m => m.id === messageId);
    if (index !== -1) {
      queue[index] = { ...queue[index], body: newBody };
      this.messageQueue = queue;
    }
  }

  /**
   * Save the chat as json file.
   */
  save = async (): Promise<void> => {
    if (!this._contentsManager) {
      return;
    }
    const directory =
      (this._settings?.composite['chatBackupDirectory'] as
        | string
        | undefined) ?? '';
    const filepath = PathExt.join(directory, `${this.name}.chat`);
    const content = JSON.stringify(this._serializeModel());
    await this._contentsManager
      .get(filepath, { content: false })
      .catch(async () => {
        await this._contentsManager
          ?.get(directory, { content: false })
          .catch(async () => {
            const dir = await this._contentsManager!.newUntitled({
              type: 'directory'
            });
            await this._contentsManager!.rename(dir.path, directory);
          });
        const file = await this._contentsManager!.newUntitled({ ext: '.chat' });
        await this._contentsManager?.rename(file.path, filepath);
      });
    await this._contentsManager.save(filepath, {
      content,
      type: 'file',
      format: 'text'
    });
  };

  /**
   * Restore the chat from a json file.
   *
   * @param silent - Whether a log should be displayed in the console if the
   * restoration is not possible.
   */
  restore = async (filepath: string, silent = false): Promise<boolean> => {
    if (!this._contentsManager) {
      return false;
    }
    const contentModel = await this._contentsManager
      .get(filepath, { content: true, type: 'file', format: 'text' })
      .catch(() => {
        if (!silent) {
          console.log(`There is no backup for chat '${this.name}'`);
        }
        return;
      });
    if (!contentModel) {
      return false;
    }
    let content: AIChatModel.ExportedChat;
    try {
      content = JSON.parse(contentModel.content);
    } catch (e) {
      throw `Error when parsing the chat ${filepath}\n${e}`;
    }

    if (content.metadata?.provider) {
      if (this._settingsModel.getProvider(content.metadata.provider)) {
        this.agentManager!.activeProvider = content.metadata.provider;
      } else if (!silent) {
        console.log(
          `Provider '${content.metadata.provider}' doesn't exist, it can't be restored.`
        );
      }
    } else if (!silent) {
      console.log(`Provider not provided when restoring ${filepath}.`);
    }

    const messages: IMessageContent[] = content.messages.map(message => {
      let attachments: IAttachment[] = [];
      if (content.attachments && message.attachments) {
        attachments =
          message.attachments.map(index => content.attachments![index]) ?? [];
      }
      return {
        ...message,
        sender: content.users[message.sender] ?? { username: 'unknown' },
        mentions: message.mentions?.map(mention => content.users[mention]),
        attachments
      };
    });
    await this.clearMessages();
    this.messagesInserted(0, messages);
    await this._persona?.rebuildHistory();
    this.autosave = content.metadata?.autosave ?? false;
    this.title = content.metadata?.title ?? null;
    return true;
  };

  /**
   * Request a title to this chat, regarding the message history.
   */
  async requestTitle(): Promise<string> {
    const history = this.messages
      .filter(msg => msg.body !== '')
      .map(
        msg =>
          `${msg.sender.username === 'ai-assistant' ? 'assistant' : 'user'}: ${msg.body}`
      )
      .join('\n');
    const messages: ModelMessage[] = [
      {
        role: 'system',
        content:
          "Generate a concise title (no more than 10 words) for the following conversation. Do not use formatting, quotes, or punctuation. Focus on the subject matter and specific content the user is working on, not on the actions taken (e.g. prefer 'Pandas DataFrame filtering' over 'Opening a notebook'). The title should be a noun phrase describing the topic."
      },
      {
        role: 'user',
        content: history
      }
    ];
    return this.agentManager!.textResponse(messages);
  }

  /**
   * Serialize the model for backup
   */
  private _serializeModel(): AIChatModel.ExportedChat {
    const provider = this.agentManager!.activeProvider;
    const messages: IMessageContent<string, string>[] = [];
    const users: { [id: string]: IUser } = {};
    const attachmentMap = new Map<string, number>(); // JSON → index
    const attachmentsList: IAttachment[] = []; // Actual attachments

    this.messages.forEach(message => {
      if (
        message.content?.mime_model?.data?.[
          'application/vnd.jupyter.chat.components'
        ] === 'message-queue'
      ) {
        return;
      }
      let attachmentIndexes: string[] = [];
      if (message.attachments) {
        attachmentIndexes = message.attachments.map(attachment => {
          const attachmentJson = JSON.stringify(attachment);
          let index: number;
          if (attachmentMap.has(attachmentJson)) {
            index = attachmentMap.get(attachmentJson)!;
          } else {
            index = attachmentsList.length;
            attachmentMap.set(attachmentJson, index);
            attachmentsList.push(attachment);
          }
          return index.toString();
        });
      }

      messages.push({
        ...message.content,
        sender: message.sender.username,
        mentions: message.mentions?.map(user => user.username),
        attachments: attachmentIndexes
      });

      if (!users[message.sender.username]) {
        users[message.sender.username] = message.sender;
      }
    });

    const attachments = Object.fromEntries(
      attachmentsList.map((item, index) => [index, item])
    );

    return {
      messages,
      users,
      attachments,
      metadata: {
        provider,
        autosave: this.autosave,
        ...(this.title ? { title: this.title } : {})
      }
    };
  }
  /**
   * Gets the AI user information for system messages.
   */
  private _getAIUser(): IUser {
    return {
      username: 'ai-assistant',
      display_name: 'Jupyternaut',
      initials: 'JN',
      color: '#2196F3',
      avatar_url: AI_AVATAR
    };
  }

  /**
   * Handles chat-specific settings changes.
   */
  private _onSettingsChanged(): void {
    this.config = {
      enableCodeToolbar: true,
      sendWithShiftEnter:
        this._settings?.composite['sendWithShiftEnter'] === true
    };
  }

  /**
   * Tracks the active provider for chat restore.
   */
  private _onModelChanged(): void {
    this._activeProvider = this.agentManager?.activeProvider ?? null;
  }

  /**
   * The current message queue
   */
  get messageQueue(): Private.IQueuedItem[] {
    return this._messageQueue;
  }
  set messageQueue(value: Private.IQueuedItem[]) {
    this._messageQueue = value;
    this._updateQueueUI();
    if (this._messageQueue.length > 0 && !this.isBusy) {
      this._drainQueue();
    }
  }

  /**
   * Whether the chat is busy (delegates to the persona's busy state).
   */
  get isBusy(): boolean {
    return this._persona?.isBusy ?? false;
  }
  set isBusy(_value: boolean) {
    // managed by persona
  }

  // Private fields
  private _persona: IPersona | null = null;
  private _settingsModel: IAISettingsModel;
  private _settings: ISettingRegistry.ISettings | null;
  private _user: IUser;
  private _activeProvider: string | null;
  private _nameChanged = new Signal<IAIChatModel, string>(this);
  private _contentsManager?: Contents.IManager;
  private _autosave: boolean = false;
  private _autosaveChanged = new Signal<IAIChatModel, boolean>(this);
  private _autosaveDebouncer: Debouncer;
  private _messageQueue: Private.IQueuedItem[] = [];
  private _queueMessageId: string | null = null;
  private _title: string | null = null;
  private _titleChanged = new Signal<IAIChatModel, string | null>(this);
}

namespace Private {
  export interface IQueuedItem {
    id: string;
    body: string;
    _originalMsg: IMessageContent;
  }
}

/**
 * Namespace containing types and interfaces for AIChatModel.
 */
export namespace AIChatModel {
  /**
   * Configuration options for constructing an AIChatModel instance.
   */
  export interface IOptions {
    /**
     * The user information for the chat
     */
    user: IUser;
    /**
     * Settings model for AI configuration
     */
    settingsModel: IAISettingsModel;
    /**
     * Registry to get the persona handler's agent manager for this model.
     */
    personaRegistry: IPersonaRegistry;
    /**
     * Optional chat-specific settings from JupyterLab setting registry.
     */
    settings?: ISettingRegistry.ISettings;
    /**
     * Optional agent manager for handling AI agent lifecycle
     */
    activeProvider?: string;
    /**
     * Optional active cell manager for Jupyter integration
     */
    activeCellManager?: IActiveCellManager;
    /**
     * Optional document manager for file operations
     */
    documentManager?: IDocumentManager;
    /**
     * The contents manager.
     */
    contentsManager?: Contents.IManager;
    /**
     * Whether to restore or not the message (default to true)
     */
    restore?: boolean;
  }

  /**
   * The chat context for toolbar buttons.
   */
  export interface IAIChatContext extends IChatContext {
    /**
     * The stop streaming callback.
     */
    stopStreaming: () => void;
    /**
     * The clear messages callback.
     */
    clearMessages: () => Promise<void>;
    /**
     * Adds an assistant/system message to the chat.
     */
    addSystemMessage: (body: string) => void;
    /**
     * The agent manager of the chat.
     */
    agentManager: IAgentManager | null;
    /**
     * Removes a queued message by its ID.
     */
    removeQueuedMessage: (id: string) => void;
    /**
     * Reorders queued messages by their IDs.
     */
    reorderQueuedMessages: (ids: string[]) => void;
    /**
     * Edits a queued message by its ID.
     */
    editQueuedMessage: (id: string, body: string) => void;
  }

  /**
   * The exported chat format.
   */
  export type ExportedChat = {
    /**
     * Message list (user are only string to avoid duplication).
     */
    messages: IMessageContent<string, string>[];
    /**
     * The user list.
     */
    users: { [id: string]: IUser };
    /**
     * The attachments of the chat.
     */
    attachments?: { [id: string]: IAttachment };
    /**
     * The metadata associated to the chat.
     */
    metadata?: {
      /**
       * Provider of the chat.
       */
      provider?: string;
      /**
       * Whether the chat is automatically saved.
       */
      autosave?: boolean;
      /**
       * An optional title of the chat.
       */
      title?: string;
    };
  };
}
