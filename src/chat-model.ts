import {
  AbstractChatModel,
  IActiveCellManager,
  IAttachment,
  IChatContext,
  IMessage,
  IMessageContent,
  IMimeModelBody,
  INewMessage,
  IUser
} from '@jupyter/chat';

import { YNotebook } from '@jupyter/ydoc';

import { PathExt } from '@jupyterlab/coreutils';

import { IDocumentManager } from '@jupyterlab/docmanager';

import { IDocumentWidget } from '@jupyterlab/docregistry';

import * as nbformat from '@jupyterlab/nbformat';

import { INotebookModel, Notebook } from '@jupyterlab/notebook';

import { IRenderMime } from '@jupyterlab/rendermime';

import { Contents } from '@jupyterlab/services';

import { UUID } from '@lumino/coreutils';

import { Debouncer } from '@lumino/polling';

import { ISignal, Signal } from '@lumino/signaling';

import { AI_AVATAR } from './icons';

import type { UserContent, ImagePart, FilePart } from 'ai';

import type { IAgentManager, IAISettingsModel, ITokenUsage } from './tokens';

/**
 * Tool call status types.
 */
type ToolStatus =
  | 'pending'
  | 'awaiting_approval'
  | 'approved'
  | 'rejected'
  | 'completed'
  | 'error';

/**
 * Context for tracking tool execution state.
 */
interface IToolExecutionContext {
  /**
   * The tool call ID from the AI SDK.
   */
  toolCallId: string;
  /**
   * The chat message ID for UI updates.
   */
  messageId: string;
  /**
   * The tool name.
   */
  toolName: string;
  /**
   * The tool input (formatted).
   */
  input: string;
  /**
   * Optional approval ID if awaiting approval.
   */
  approvalId?: string;
  /**
   * Current status.
   */
  status: ToolStatus;
  /**
   * Human-readable summary extracted from tool input for display.
   */
  summary?: string;
  /**
   * Whether this tool call should auto-render trusted MIME bundles on completion.
   */
  shouldAutoRenderMimeBundles?: boolean;
}

/**
 * AI Chat Model implementation that provides chat functionality tool integration,
 * and MCP server support.
 */
export class AIChatModel extends AbstractChatModel {
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
        sendWithShiftEnter: options.settingsModel.config.sendWithShiftEnter
      }
    });
    this._settingsModel = options.settingsModel;
    this._user = options.user;
    this._agentManager = options.agentManager;
    this._contentsManager = options.contentsManager;

    // Listen for agent events
    this._agentManager.agentEvent.connect(this._onAgentEvent, this);

    // Listen for settings changes to update chat behavior
    this._settingsModel.stateChanged.connect(this._onSettingsChanged, this);

    this._autosaveDebouncer = new Debouncer(this.save, 3000);
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
      const directory = this._settingsModel.config.chatBackupDirectory;
      const filepath = PathExt.join(directory, `${this.name}.chat`);
      this.restore(filepath, true);
    }
    this.setReady();
  }

  /**
   * Whether to save the chat automatically.
   */
  get autosave(): boolean {
    return this._autosave;
  }
  set autosave(value: boolean) {
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
      this._autosaveDebouncer.invoke();
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
  }

  /**
   * A signal emitting when the autosave flag changed.
   */
  get autosaveChanged(): ISignal<AIChatModel, boolean> {
    return this._autosaveChanged;
  }

  /**
   * A signal emitting when the chat name has changed.
   */
  get nameChanged(): ISignal<AIChatModel, string> {
    return this._nameChanged;
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
  get tokenUsageChanged(): ISignal<IAgentManager, ITokenUsage> {
    return this._agentManager.tokenUsageChanged;
  }

  /**
   * Get the agent manager associated to the model.
   */
  get agentManager(): IAgentManager {
    return this._agentManager;
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
      agentManager: this._agentManager,
      addSystemMessage: (body: string) => this.addSystemMessage(body)
    };
  }

  /**
   * Stops the current streaming response by aborting the request.
   */
  stopStreaming = (): void => {
    this._agentManager.stopStreaming();
  };

  /**
   * Clears all messages from the chat and resets conversation state.
   */
  clearMessages = (): void => {
    this.messagesDeleted(0, this.messages.length);
    this._toolContexts.clear();
    this._agentManager.clearHistory();
  };

  /**
   * Adds a non-user message to the chat (used by chat commands).
   */
  addSystemMessage(body: string): void {
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
      attachments: [...this.input.attachments]
    };
    this.messageAdded(userMessage);

    // Check if we have valid configuration
    if (!this._agentManager.hasValidConfig()) {
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

    try {
      // Process attachments and add their content to the message
      let enhancedMessage: UserContent = message.body;
      if (this.input.attachments.length > 0) {
        const { textContents, binaryParts } = await Private.processAttachments(
          this.input.attachments,
          this.input.documentManager
        );
        this.input.clearAttachments();

        let textPart = message.body;
        if (textContents.length > 0) {
          textPart +=
            '\n\n--- Attached Files ---\n' + textContents.join('\n\n');
        }

        if (binaryParts.length > 0) {
          enhancedMessage = [{ type: 'text', text: textPart }, ...binaryParts];
        } else {
          enhancedMessage = textPart;
        }
      }

      this.updateWriters([{ user: this._getAIUser() }]);

      await this._agentManager.generateResponse(enhancedMessage);
    } catch (error) {
      const errorMessage: IMessageContent = {
        body: `Error generating AI response: ${(error as Error).message}`,
        sender: this._getAIUser(),
        id: UUID.uuid4(),
        time: Date.now() / 1000,
        type: 'msg',
        raw_time: false
      };
      this.messageAdded(errorMessage);
    } finally {
      this.updateWriters([]);
    }
  }

  /**
   * Save the chat as json file.
   */
  save = async (): Promise<void> => {
    if (!this._contentsManager) {
      return;
    }
    const directory = this._settingsModel.config.chatBackupDirectory;
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
        this._agentManager.activeProvider = content.metadata.provider;
      } else if (!silent) {
        console.log(
          `Provider '${content.metadata.provider}' doesn't exist, it can't be restored.`
        );
      }
    } else if (!silent) {
      console.log(`Provider not providing when restoring ${filepath}.`);
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
    this.clearMessages();
    this.messagesInserted(0, messages);
    this._agentManager.setHistory(messages);
    this.autosave = content.metadata?.autosave ?? false;
    return true;
  };

  /**
   * Serialize the model for backup
   */
  private _serializeModel(): AIChatModel.ExportedChat {
    const provider = this._agentManager.activeProvider;
    const messages: IMessageContent<string, string>[] = [];
    const users: { [id: string]: IUser } = {};
    const attachmentMap = new Map<string, number>(); // JSON → index
    const attachmentsList: IAttachment[] = []; // Actual attachments

    this.messages.forEach(message => {
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
        autosave: this.autosave
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
   * Handles settings changes and updates chat configuration accordingly.
   */
  private _onSettingsChanged(): void {
    const config = this._settingsModel.config;
    this.config = { ...config, enableCodeToolbar: true };
    // Agent manager handles agent recreation automatically via its own settings listener
  }

  /**
   * Handles events emitted by the agent manager.
   * @param event The event data containing type and payload
   */
  private _onAgentEvent(
    _sender: IAgentManager,
    event: IAgentManager.IAgentEvent
  ): void {
    switch (event.type) {
      case 'message_start':
        this._handleMessageStart(event);
        break;
      case 'message_chunk':
        this._handleMessageChunk(event);
        break;
      case 'message_complete':
        this._handleMessageComplete(event);
        break;
      case 'tool_call_start':
        this._handleToolCallStartEvent(event);
        break;
      case 'tool_call_complete':
        this._handleToolCallCompleteEvent(event);
        break;
      case 'tool_approval_request':
        this._handleToolApprovalRequest(event);
        break;
      case 'tool_approval_resolved':
        this._handleToolApprovalResolved(event);
        break;
      case 'error':
        this._handleErrorEvent(event);
        break;
    }
  }

  /**
   * Handles the start of a new message from the AI agent.
   * @param event Event containing the message start data
   */
  private _handleMessageStart(
    event: IAgentManager.IAgentEvent<'message_start'>
  ): void {
    const aiMessage: IMessageContent = {
      body: '',
      sender: this._getAIUser(),
      id: event.data.messageId,
      time: Date.now() / 1000,
      type: 'msg',
      raw_time: false
    };
    this.messageAdded(aiMessage);
    this._currentStreamingMessage =
      this.messages.find(message => message.id === aiMessage.id) ?? null;
  }

  /**
   * Handles streaming message chunks from the AI agent.
   * @param event Event containing the message chunk data
   */
  private _handleMessageChunk(
    event: IAgentManager.IAgentEvent<'message_chunk'>
  ): void {
    if (
      this._currentStreamingMessage &&
      this._currentStreamingMessage.id === event.data.messageId
    ) {
      this._currentStreamingMessage.update({ body: event.data.fullContent });
    }
  }

  /**
   * Handles the completion of a message from the AI agent.
   * @param event Event containing the message completion data
   */
  private _handleMessageComplete(
    event: IAgentManager.IAgentEvent<'message_complete'>
  ): void {
    if (
      this._currentStreamingMessage &&
      this._currentStreamingMessage.id === event.data.messageId
    ) {
      this._currentStreamingMessage.update({ body: event.data.content });
      this._currentStreamingMessage = null;
    }
  }

  /**
   * Extracts a human-readable summary from tool input for display in the header.
   * @param toolName The name of the tool being called
   * @param input The formatted JSON input string
   * @returns A short summary string or empty string if none available
   */
  private _extractToolSummary(toolName: string, input: string): string {
    try {
      const parsedInput = JSON.parse(input);

      switch (toolName) {
        case 'execute_command':
          if (parsedInput.commandId) {
            return parsedInput.commandId;
          }
          break;
        case 'discover_commands':
          if (parsedInput.query) {
            return `query: "${parsedInput.query}"`;
          }
          break;
        case 'discover_skills':
          if (parsedInput.query) {
            return `query: "${parsedInput.query}"`;
          }
          break;
        case 'load_skill':
          if (parsedInput.name) {
            if (parsedInput.resource) {
              return `${parsedInput.name} (${parsedInput.resource})`;
            }
            return parsedInput.name;
          }
          break;
        case 'browser_fetch':
          if (parsedInput.url) {
            return parsedInput.url;
          }
          break;
        case 'web_fetch':
          if (parsedInput.url) {
            return parsedInput.url;
          }
          break;
        case 'web_search':
          if (parsedInput.query) {
            return `query: "${parsedInput.query}"`;
          }
          break;
      }
    } catch {
      // If parsing fails, return empty string
    }
    return '';
  }

  /**
   * Determine whether this tool call should auto-render trusted MIME bundles.
   */
  private _computeShouldAutoRenderMimeBundles(
    toolName: string,
    input: string
  ): boolean {
    if (toolName !== 'execute_command') {
      return false;
    }

    try {
      const parsedInput = JSON.parse(input);
      return (
        typeof parsedInput.commandId === 'string' &&
        this._settingsModel.config.commandsAutoRenderMimeBundles.includes(
          parsedInput.commandId
        )
      );
    } catch {
      return false;
    }
  }

  /**
   * Handles the start of a tool call execution.
   * @param event Event containing the tool call start data
   */
  private _handleToolCallStartEvent(
    event: IAgentManager.IAgentEvent<'tool_call_start'>
  ): void {
    const messageId = UUID.uuid4();
    const summary = this._extractToolSummary(
      event.data.toolName,
      event.data.input
    );
    const shouldAutoRenderMimeBundles =
      this._computeShouldAutoRenderMimeBundles(
        event.data.toolName,
        event.data.input
      );
    const context: IToolExecutionContext = {
      toolCallId: event.data.callId,
      messageId,
      toolName: event.data.toolName,
      input: event.data.input,
      status: 'pending',
      summary,
      shouldAutoRenderMimeBundles
    };

    this._toolContexts.set(event.data.callId, context);

    const toolCallMessage: IMessageContent = {
      body: '',
      mime_model: {
        data: {
          'application/vnd.jupyter.chat.components': 'tool-call'
        },
        metadata: {
          toolName: context.toolName,
          input: context.input,
          status: context.status,
          summary: context.summary
        }
      },
      sender: this._getAIUser(),
      id: messageId,
      time: Date.now() / 1000,
      type: 'msg',
      raw_time: false
    };

    this.messageAdded(toolCallMessage);
  }

  /**
   * Handles the completion of a tool call execution.
   */
  private _handleToolCallCompleteEvent(
    event: IAgentManager.IAgentEvent<'tool_call_complete'>
  ): void {
    const context = this._toolContexts.get(event.data.callId);
    const status = event.data.isError ? 'error' : 'completed';
    this._updateToolCallUI(
      event.data.callId,
      status,
      Private.formatToolOutput(event.data.outputData)
    );

    if (!event.data.isError && this._shouldAutoRenderMimeBundles(context)) {
      // Tool results are arbitrary command payloads (often wrapped in
      // { success, result, outputs, ... }), so extract display outputs
      // defensively instead of assuming a raw kernel message shape.
      const mimeBundles = Private.extractMimeBundlesFromUnknown(
        event.data.outputData,
        {
          trustedMimeTypes:
            this._settingsModel.config.trustedMimeTypesForAutoRender
        }
      );
      for (const bundle of mimeBundles) {
        this.messageAdded({
          body: '',
          mime_model: bundle,
          sender: this._getAIUser(),
          id: UUID.uuid4(),
          time: Date.now() / 1000,
          type: 'msg',
          raw_time: false
        });
      }
    }

    this._toolContexts.delete(event.data.callId);
  }

  /**
   * Determine whether a tool call output should auto-render MIME bundles.
   */
  private _shouldAutoRenderMimeBundles(
    context: IToolExecutionContext | undefined
  ): boolean {
    if (!context) {
      return false;
    }

    return !!context.shouldAutoRenderMimeBundles;
  }

  /**
   * Handles error events from the AI agent.
   */
  private _handleErrorEvent(event: IAgentManager.IAgentEvent<'error'>): void {
    this.messageAdded({
      body: `Error generating response: ${event.data.error.message}`,
      sender: this._getAIUser(),
      id: UUID.uuid4(),
      time: Date.now() / 1000,
      type: 'msg',
      raw_time: false
    });
  }

  /**
   * Handles tool approval request events from the AI agent.
   */
  private _handleToolApprovalRequest(
    event: IAgentManager.IAgentEvent<'tool_approval_request'>
  ): void {
    const context = this._toolContexts.get(event.data.toolCallId);
    if (!context) {
      return;
    }
    context.approvalId = event.data.approvalId;
    context.input = JSON.stringify(event.data.args, null, 2);
    this._updateToolCallUI(event.data.toolCallId, 'awaiting_approval');
  }

  /**
   * Handles tool approval resolved events from the AI agent.
   */
  private _handleToolApprovalResolved(
    event: IAgentManager.IAgentEvent<'tool_approval_resolved'>
  ): void {
    const context = Array.from(this._toolContexts.values()).find(
      ctx => ctx.approvalId === event.data.approvalId
    );
    if (!context) {
      return;
    }

    const status = event.data.approved ? 'approved' : 'rejected';
    this._updateToolCallUI(context.toolCallId, status);

    if (!event.data.approved) {
      this._toolContexts.delete(context.toolCallId);
    }
  }

  /**
   * Updates a tool call's UI with new status and optional output.
   */
  private _updateToolCallUI(
    toolCallId: string,
    status: ToolStatus,
    output?: string
  ): void {
    const context = this._toolContexts.get(toolCallId);
    if (!context) {
      return;
    }

    const existingMessage = this.messages.find(
      msg => msg.id === context.messageId
    );
    if (!existingMessage) {
      return;
    }

    context.status = status;
    existingMessage.update({
      mime_model: {
        data: {
          'application/vnd.jupyter.chat.components': 'tool-call'
        },
        metadata: {
          toolName: context.toolName,
          input: context.input,
          status: context.status,
          summary: context.summary,
          output,
          targetId: this.name,
          approvalId: context.approvalId
        }
      }
    });
  }

  // Private fields
  private _settingsModel: IAISettingsModel;
  private _user: IUser;
  private _toolContexts: Map<string, IToolExecutionContext> = new Map();
  private _agentManager: IAgentManager;
  private _currentStreamingMessage: IMessage | null = null;
  private _nameChanged = new Signal<AIChatModel, string>(this);
  private _contentsManager?: Contents.IManager;
  private _autosave: boolean = false;
  private _autosaveChanged = new Signal<AIChatModel, boolean>(this);
  private _autosaveDebouncer: Debouncer;
}

namespace Private {
  type IDisplayOutput =
    | nbformat.IDisplayData
    | nbformat.IDisplayUpdate
    | nbformat.IExecuteResult;

  const isPlainObject = (value: unknown): value is Record<string, unknown> => {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  };

  const isDisplayOutput = (value: unknown): value is IDisplayOutput => {
    if (!isPlainObject(value)) {
      return false;
    }

    const output = value as nbformat.IOutput;
    return (
      nbformat.isDisplayData(output) ||
      nbformat.isDisplayUpdate(output) ||
      nbformat.isExecuteResult(output)
    );
  };

  const toMimeBundle = (
    value: IDisplayOutput,
    trustedMimeTypes: ReadonlySet<string>
  ): IMimeModelBody | null => {
    const data = value.data;
    if (!isPlainObject(data) || Object.keys(data).length === 0) {
      return null;
    }

    return {
      data: data as IRenderMime.IMimeModel['data'],
      ...(isPlainObject(value.metadata)
        ? { metadata: value.metadata as IRenderMime.IMimeModel['metadata'] }
        : {}),
      // MIME auto-rendering only runs for explicitly configured command IDs.
      // Trust handling is configurable to keep risky MIME execution opt-in.
      ...(Object.keys(data).some(m => trustedMimeTypes.has(m))
        ? { trusted: true }
        : {})
    };
  };

  /**
   * Normalize arbitrary tool payloads into canonical display outputs.
   *
   * Tool outputs are not guaranteed to be raw Jupyter IOPub messages; they are
   * often wrapped objects (for example `{ success, result: { outputs: [...] } }`).
   */
  const toDisplayOutputs = (value: unknown): IDisplayOutput[] => {
    if (isDisplayOutput(value)) {
      return [value];
    }

    if (Array.isArray(value)) {
      return value.filter(isDisplayOutput);
    }

    if (!isPlainObject(value)) {
      return [];
    }

    if (Array.isArray(value.outputs)) {
      return value.outputs.filter(isDisplayOutput);
    }

    if ('result' in value) {
      return toDisplayOutputs(value.result);
    }

    return [];
  };

  /**
   * Extract rendermime-ready mime bundles from arbitrary tool results.
   */
  export function extractMimeBundlesFromUnknown(
    content: unknown,
    options: { trustedMimeTypes?: ReadonlyArray<string> } = {}
  ): IMimeModelBody[] {
    const bundles: IMimeModelBody[] = [];
    const outputs = toDisplayOutputs(content);
    const trustedMimeTypes = new Set(options.trustedMimeTypes ?? []);
    for (const output of outputs) {
      const bundle = toMimeBundle(output, trustedMimeTypes);
      if (bundle) {
        bundles.push(bundle);
      }
    }
    return bundles;
  }

  export function formatToolOutput(outputData: unknown): string {
    if (typeof outputData === 'string') {
      return outputData;
    }

    try {
      return JSON.stringify(outputData, null, 2);
    } catch {
      return '[Complex object - cannot serialize]';
    }
  }

  /**
   * Processes file attachments and returns text contents and binary parts separately.
   * @param attachments Array of file attachments to process
   * @param documentManager Optional document manager for file operations
   * @returns Text contents and binary parts
   */
  export async function processAttachments(
    attachments: IAttachment[],
    documentManager: IDocumentManager | null | undefined
  ): Promise<{
    textContents: string[];
    binaryParts: Array<ImagePart | FilePart>;
  }> {
    const textContents: string[] = [];
    const binaryParts: Array<ImagePart | FilePart> = [];

    if (!documentManager) {
      return { textContents, binaryParts };
    }

    for (const attachment of attachments) {
      try {
        if (attachment.type === 'notebook' && attachment.cells?.length) {
          const cellContents = await readNotebookCells(
            attachment,
            documentManager
          );
          if (cellContents) {
            textContents.push(cellContents);
          }
        } else {
          let mimetype = attachment.mimetype;
          const fileExtension = PathExt.extname(attachment.value).toLowerCase();

          // Fetch mimetype from server metadata if not provided
          if (!mimetype) {
            try {
              const diskModel = await documentManager.services.contents.get(
                attachment.value,
                { content: false }
              );
              mimetype = diskModel?.mimetype;
            } catch (e) {
              console.warn(
                `Failed to fetch metadata for ${attachment.value}:`,
                e
              );
            }
          }

          if (mimetype?.startsWith('image/')) {
            const data = await readBinaryAttachment(
              attachment,
              documentManager
            );
            if (data) {
              binaryParts.push({
                type: 'image',
                image: data,
                mediaType: mimetype
              });
            }
          } else if (mimetype === 'application/pdf') {
            const data = await readBinaryAttachment(
              attachment,
              documentManager
            );
            if (data) {
              binaryParts.push({
                type: 'file',
                data,
                mediaType: mimetype,
                filename: PathExt.basename(attachment.value)
              });
            }
          } else {
            const fileContent = await readFileAttachment(
              attachment,
              documentManager
            );
            if (fileContent) {
              const language =
                fileExtension === '.ipynb' ||
                mimetype === 'application/x-ipynb+json'
                  ? 'json'
                  : '';
              textContents.push(
                `**File: ${attachment.value}**\n\`\`\`${language}\n${fileContent}\n\`\`\``
              );
            }
          }
        }
      } catch (error) {
        console.warn(`Failed to read attachment ${attachment.value}:`, error);
        textContents.push(
          `**File: ${attachment.value}** (Could not read file)`
        );
      }
    }

    return { textContents, binaryParts };
  }

  /**
   * Reads a binary attachment and returns its base64-encoded content.
   * @param attachment The attachment to read
   * @param documentManager Optional document manager for file operations
   * @returns Base64 string or null if unable to read
   */
  export async function readBinaryAttachment(
    attachment: IAttachment,
    documentManager: IDocumentManager | null | undefined
  ): Promise<string | null> {
    if (!documentManager) {
      return null;
    }

    try {
      const diskModel = await documentManager.services.contents.get(
        attachment.value,
        { content: true }
      );
      if (diskModel?.content && diskModel.format === 'base64') {
        // Strip whitespace/newlines
        return (diskModel.content as string).replace(/\s/g, '');
      }
      return null;
    } catch (error) {
      console.warn(
        `Failed to read binary attachment ${attachment.value}:`,
        error
      );
      return null;
    }
  }

  /**
   * Reads the content of a notebook cell.
   * @param attachment The notebook attachment to read
   * @param documentManager Optional document manager for file operations
   * @returns Cell content as string or null if unable to read
   */
  export async function readNotebookCells(
    attachment: IAttachment,
    documentManager: IDocumentManager | null | undefined
  ): Promise<string | null> {
    if (
      attachment.type !== 'notebook' ||
      !attachment.cells ||
      !documentManager
    ) {
      return null;
    }

    try {
      // Try reading from live notebook if open
      const widget = documentManager.findWidget(attachment.value) as
        | IDocumentWidget<Notebook, INotebookModel>
        | undefined;
      let cellData: nbformat.ICell[];
      let kernelLang = 'text';

      const ymodel = widget?.context.model.sharedModel as YNotebook;

      if (ymodel) {
        const nb = ymodel.toJSON();

        cellData = nb.cells;

        const lang =
          nb.metadata.language_info?.name ||
          nb.metadata.kernelspec?.language ||
          'text';

        kernelLang = String(lang);
      } else {
        // Fallback: reading from disk
        const model = await documentManager.services.contents.get(
          attachment.value
        );
        if (!model || model.type !== 'notebook') {
          return null;
        }
        cellData = model.content.cells ?? [];

        kernelLang =
          model.content.metadata.language_info?.name ||
          model.content.metadata.kernelspec?.language ||
          'text';
      }

      const selectedCells = attachment.cells
        .map(cellInfo => {
          const cell = cellData.find(c => c.id === cellInfo.id);
          if (!cell) {
            return null;
          }

          const code = cell.source || '';
          const cellType = cell.cell_type;
          const lang = cellType === 'code' ? kernelLang : cellType;

          const DISPLAY_PRIORITY = [
            'application/vnd.jupyter.widget-view+json',
            'application/javascript',
            'text/html',
            'image/svg+xml',
            'image/png',
            'image/jpeg',
            'text/markdown',
            'text/latex',
            'text/plain'
          ];

          function extractDisplay(data: nbformat.IMimeBundle): string {
            for (const mime of DISPLAY_PRIORITY) {
              if (!(mime in data)) {
                continue;
              }

              const value = data[mime];
              if (!value) {
                continue;
              }

              switch (mime) {
                case 'application/vnd.jupyter.widget-view+json':
                  return `Widget: ${(value as { model_id?: string }).model_id ?? 'unknown model'}`;

                case 'image/png':
                  return `![image](data:image/png;base64,${String(value).slice(0, 100)}...)`;

                case 'image/jpeg':
                  return `![image](data:image/jpeg;base64,${String(value).slice(0, 100)}...)`;

                case 'image/svg+xml':
                  return String(value).slice(0, 500) + '...\n[svg truncated]';

                case 'text/html':
                  return (
                    String(value).slice(0, 1000) +
                    (String(value).length > 1000 ? '\n...[truncated]' : '')
                  );

                case 'text/markdown':
                case 'text/latex':
                case 'text/plain': {
                  let text = Array.isArray(value)
                    ? value.join('')
                    : String(value);
                  if (text.length > 2000) {
                    text = text.slice(0, 2000) + '\n...[truncated]';
                  }
                  return text;
                }

                default:
                  return JSON.stringify(value).slice(0, 2000);
              }
            }

            return JSON.stringify(data).slice(0, 2000);
          }

          let outputs = '';
          if (cellType === 'code' && Array.isArray(cell.outputs)) {
            const outputsArray = cell.outputs as nbformat.IOutput[];
            outputs = outputsArray
              .map(output => {
                if (output.output_type === 'stream') {
                  return (output as nbformat.IStream).text;
                } else if (output.output_type === 'error') {
                  const err = output as nbformat.IError;
                  return `${err.ename}: ${err.evalue}\n${(err.traceback || []).join('\n')}`;
                } else if (
                  output.output_type === 'execute_result' ||
                  output.output_type === 'display_data'
                ) {
                  const data = (output as nbformat.IDisplayData).data;
                  if (!data) {
                    return '';
                  }
                  try {
                    return extractDisplay(data);
                  } catch (e) {
                    console.error('Cannot extract cell output', e);
                    return '';
                  }
                }
                return '';
              })
              .filter(Boolean)
              .join('\n---\n');

            if (outputs.length > 2000) {
              outputs = outputs.slice(0, 2000) + '\n...[truncated]';
            }
          }

          return (
            `**Cell [${cellInfo.id}] (${cellType}):**\n` +
            `\`\`\`${lang}\n${code}\n\`\`\`` +
            (outputs ? `\n**Outputs:**\n\`\`\`text\n${outputs}\n\`\`\`` : '')
          );
        })
        .filter(Boolean)
        .join('\n\n');

      return `**Notebook: ${attachment.value}**\n${selectedCells}`;
    } catch (error) {
      console.warn(
        `Failed to read notebook cells from ${attachment.value}:`,
        error
      );
      return null;
    }
  }

  /**
   * Reads the content of a file attachment.
   * @param attachment The file attachment to read
   * @param documentManager Optional document manager for file operations
   * @returns File content as string or null if unable to read
   */
  export async function readFileAttachment(
    attachment: IAttachment,
    documentManager: IDocumentManager | null | undefined
  ): Promise<string | null> {
    // Handle both 'file' and 'notebook' types since both have a 'value' path
    if (
      (attachment.type !== 'file' && attachment.type !== 'notebook') ||
      !documentManager
    ) {
      return null;
    }

    try {
      // Try reading from an open widget first
      const widget = documentManager.findWidget(attachment.value) as
        | IDocumentWidget<Notebook, INotebookModel>
        | undefined;

      if (widget && widget.context && widget.context.model) {
        const model = widget.context.model;
        const ymodel = model.sharedModel as YNotebook;

        if (typeof ymodel.getSource === 'function') {
          const source = ymodel.getSource();
          return typeof source === 'string'
            ? source
            : JSON.stringify(source, null, 2);
        }
      }

      // If not open, load from disk
      const diskModel = await documentManager.services.contents.get(
        attachment.value
      );

      if (!diskModel?.content) {
        return null;
      }

      if (diskModel.type === 'file') {
        // Regular file content
        return diskModel.content;
      }

      if (diskModel.type === 'notebook') {
        const cleaned = {
          ...diskModel,
          cells: diskModel.content.cells.map((cell: nbformat.ICell) => ({
            ...cell,
            outputs: [] as nbformat.IOutput[],
            execution_count: null
          }))
        };

        return JSON.stringify(cleaned);
      }
      return null;
    } catch (error) {
      console.warn(`Failed to read file ${attachment.value}:`, error);
      return null;
    }
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
     * Optional agent manager for handling AI agent lifecycle
     */
    agentManager: IAgentManager;
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
    clearMessages: () => void;
    /**
     * Adds an assistant/system message to the chat.
     */
    addSystemMessage: (body: string) => void;
    /**
     * The agent manager of the chat.
     */
    agentManager: IAgentManager;
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
    };
  };
}
