import {
  IAttachment,
  IMessage,
  IChatModel,
  IUser,
  INewMessage
} from '@jupyter/chat';

import type { IDocumentManager } from '@jupyterlab/docmanager';

import type {
  IAgentManager,
  IAISettingsModel,
  IProviderRegistry
} from '@jupyternaut/agent';

import {
  extractMimeBundles,
  modelSupportsAudio,
  modelSupportsImages,
  modelSupportsPdf
} from '@jupyternaut/agent';

import { ISignal, Signal } from '@lumino/signaling';

import type { ModelMessage, UserContent } from 'ai';

import { processAttachments } from './process-attachments';

import { DEFAULT_PERSONA, type IPersona } from './tokens';

type ToolStatus =
  | 'in_progress'
  | 'awaiting_approval'
  | 'rejected'
  | 'completed'
  | 'failed';

interface IToolExecutionContext {
  toolCallId: string;
  messageId: string;
  toolName: string;
  title?: string;
  input: string;
  status: ToolStatus;
  summary?: string;
  shouldAutoRenderMimeBundles?: boolean;
}

function extractToolSummary(toolName: string, input: string): string {
  try {
    const parsed = JSON.parse(input);
    switch (toolName) {
      case 'execute_command':
        return parsed.commandId ?? '';
      case 'discover_commands':
      case 'discover_skills':
      case 'web_search':
        return parsed.query ? `query: "${parsed.query}"` : '';
      case 'load_skill':
        return parsed.name
          ? parsed.resource
            ? `${parsed.name} (${parsed.resource})`
            : parsed.name
          : '';
      case 'browser_fetch':
      case 'web_fetch':
        return parsed.url ?? '';
    }
  } catch {
    // ignore malformed input
  }
  return '';
}

function formatToolOutput(outputData: unknown): string {
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
 * Links an IAgentManager to an IChatModel for the Jupyternaut persona.
 *
 * Monitors new messages arriving on the chat model and responds when the
 * persona trigger string is mentioned. The handler and its agent stay alive
 * as long as the associated chat widget is open, so conversation history is
 * preserved across multiple mentions.
 */
export class Persona implements IPersona {
  constructor(options: Persona.IOptions) {
    this._model = options.model;
    this._agent = options.agentManager;
    this._persona = options.persona;
    this._settingsModel = options.settingsModel;
    this._providerRegistry = options.providerRegistry;
    this._documentManager = options.documentManager;

    this._agent.agentEvent.connect(this._onAgentEvent, this);
    this._agent.activeProviderChanged.connect(
      this._onActiveProviderChanged,
      this
    );

    // Wait for the chat to be ready before connect to message update.
    this._model.ready.then(() => {
      for (const message of this._model.messages) {
        this._respondedToIds.add(message.id);
      }
      this._model.messagesUpdated.connect(this._onMessagesUpdated, this);
    });

    this._model.disposed.connect(this.dispose, this);
  }

  dispose(): void {
    this._agent.agentEvent.disconnect(this._onAgentEvent, this);
    this._agent.activeProviderChanged.disconnect(
      this._onActiveProviderChanged,
      this
    );
    this._model.messagesUpdated.disconnect(this._onMessagesUpdated, this);
  }

  get agentManager(): IAgentManager {
    return this._agent;
  }

  get model(): IChatModel {
    return this._model;
  }

  get isBusy(): boolean {
    return this._busy;
  }

  get busyChanged(): ISignal<IPersona, boolean> {
    return this._busyChanged;
  }

  private async _onMessagesUpdated(): Promise<void> {
    const unhandled = this._model.messages.filter(
      m =>
        // message not yet responded
        !this._respondedToIds.has(m.id) &&
        // AND message from user
        !m.sender.bot &&
        // AND set up to respond to all user message (@jupyterlite/ai compatibility)
        (!this.requireMention ||
          // OR persona mentioned in the message
          m.mentions?.includes(this._persona) ||
          // OR persona explicitly targeted in metadata (jupyter-ai compatibility)
          (m.metadata as any)?.to_persona === DEFAULT_PERSONA.username)
    );

    for (const message of unhandled) {
      this._respondedToIds.add(message.id);
    }

    for (const message of unhandled) {
      const personaMention = `@${this._persona.mention_name}`;
      const body = message.body.replace(personaMention, '').trim();
      await this._respond(
        body || message.body,
        message.attachments,
        // Model (provider in this @jupyternaut) explicitly targeted in metadata (jupyter-ai compatibility)
        (message.metadata as any)?.model?.id
      );
    }
  }

  private async _respond(
    body: string,
    attachments?: IAttachment[],
    provider?: string
  ): Promise<void> {
    this._busy = true;
    this._busyChanged.emit(true);
    this._model.updateWriters([{ user: this._persona }]);
    try {
      // Rebuild the agent if the current one is not the expected one.
      if (
        provider &&
        this._agent.activeProvider !== provider &&
        this._settingsModel.getProvider(provider)
      ) {
        await this._agent.setActiveProvider(provider);
      }

      let content: UserContent = body;
      if (attachments && attachments.length > 0) {
        const providerConfig = this._settingsModel.getProvider(
          this._agent.activeProvider
        );
        content = await processAttachments(
          attachments,
          this._documentManager,
          body,
          modelSupportsImages(providerConfig, this._providerRegistry),
          modelSupportsPdf(providerConfig, this._providerRegistry),
          modelSupportsAudio(providerConfig, this._providerRegistry)
        );
      }

      await this._agent.generateResponse(content);
    } catch (error) {
      console.error('Persona: error generating response', error);
    } finally {
      this._busy = false;
      this._busyChanged.emit(false);
      this._model.updateWriters([]);
    }
  }

  rebuildHistory(): Promise<void> {
    return this._rebuildHistory();
  }

  private _onActiveProviderChanged(): void {
    const providerConfig = this._settingsModel.getProvider(
      this._agent.activeProvider
    );
    const modelKey = providerConfig
      ? `${providerConfig.provider}:${providerConfig.model}`
      : undefined;
    if (modelKey && modelKey !== this._currentModelKey) {
      this._currentModelKey = modelKey;
      this._rebuildHistory().catch(e =>
        console.warn('Failed to rebuild history on model change:', e)
      );
    }
  }

  private async _rebuildHistory(): Promise<void> {
    const providerConfig = this._settingsModel.getProvider(
      this._agent.activeProvider
    );
    const supportsImages = modelSupportsImages(
      providerConfig,
      this._providerRegistry
    );
    const supportsPdf = modelSupportsPdf(
      providerConfig,
      this._providerRegistry
    );
    const supportsAudio = modelSupportsAudio(
      providerConfig,
      this._providerRegistry
    );

    const modelMessages: ModelMessage[] = [];
    for (const msg of this._model.messages) {
      const isAI = msg.sender.bot === true;
      if (!isAI && msg.attachments?.length) {
        const enhancedContent = await processAttachments(
          msg.attachments,
          this._documentManager,
          msg.body,
          supportsImages,
          supportsPdf,
          supportsAudio
        );
        modelMessages.push({ role: 'user', content: enhancedContent });
      } else if (msg.body) {
        modelMessages.push({
          role: isAI ? 'assistant' : 'user',
          content: msg.body
        });
      }
    }

    this._agent.setHistory(modelMessages);
  }

  private _onAgentEvent(
    _: IAgentManager,
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
        this._handleToolCallStart(event);
        break;
      case 'tool_call_complete':
        this._handleToolCallComplete(event);
        break;
      case 'tool_approval_request':
        this._handleToolApprovalRequest(event);
        break;
      case 'tool_approval_resolved':
        this._handleToolApprovalResolved(event);
        break;
      case 'error':
        this._handleError(event);
        break;
    }
  }

  /**
   * Wait for a message with the given id to appear in model.messages.
   * Returns immediately if already present; otherwise waits for messagesUpdated,
   * ignoring unrelated updates (e.g. peer messages). Times out after 5 s to
   * avoid leaking the signal connection on error.
   * This in necessary for chat using web socket, as the model is updated only when
   * the message is broadcasted from the server.
   */
  private _waitForMessage(msgId: string): Promise<IMessage | undefined> {
    const found = this._model.messages.find(m => m.id === msgId);
    if (found) {
      return Promise.resolve(found);
    }
    return new Promise<IMessage | undefined>(resolve => {
      const cleanup = (result: IMessage | undefined) => {
        clearTimeout(timer);
        this._model.messagesUpdated.disconnect(onUpdate);
        resolve(result);
      };
      const onUpdate = () => {
        const msg = this._model.messages.find(m => m.id === msgId);
        if (msg) {
          cleanup(msg);
        }
      };
      const timer = setTimeout(() => cleanup(undefined), 5000);
      this._model.messagesUpdated.connect(onUpdate);
    });
  }

  private async _handleMessageStart(
    event: IAgentManager.IAgentEvent<'message_start'>
  ): Promise<void> {
    // Pre-register a buffer so any chunk/complete events that arrive while
    // sendMessage is in-flight are queued rather than dropped.
    this._eventBuffer.set(event.data.messageId, []);

    const message: INewMessage = {
      body: '',
      sender: this._persona
    };
    const msgId = await this._model.sendMessage(message);
    if (msgId) {
      const streamingMessage = await this._waitForMessage(msgId);
      if (streamingMessage) {
        this._streamingMessage.set(event.data.messageId, streamingMessage);
        const buffered = this._eventBuffer.get(event.data.messageId) ?? [];
        this._eventBuffer.delete(event.data.messageId);
        for (const bufferedEvent of buffered) {
          if (bufferedEvent.type === 'message_chunk') {
            this._handleMessageChunk(bufferedEvent);
          } else {
            this._handleMessageComplete(bufferedEvent);
          }
        }
        return;
      }
    }
    this._eventBuffer.delete(event.data.messageId);
  }

  private _handleMessageChunk(
    event: IAgentManager.IAgentEvent<'message_chunk'>
  ): void {
    if (this._eventBuffer.has(event.data.messageId)) {
      this._eventBuffer.get(event.data.messageId)!.push(event);
      return;
    }
    const streamingMessage = this._streamingMessage.get(event.data.messageId);
    if (streamingMessage) {
      if (!this._model.updateMessage) {
        streamingMessage.update({ body: event.data.fullContent });
      } else {
        this._model.updateMessage(streamingMessage.id, {
          ...streamingMessage.content,
          body: event.data.fullContent
        });
      }
    }
  }

  private _handleMessageComplete(
    event: IAgentManager.IAgentEvent<'message_complete'>
  ): void {
    if (this._eventBuffer.has(event.data.messageId)) {
      this._eventBuffer.get(event.data.messageId)!.push(event);
      return;
    }
    const streamingMessage = this._streamingMessage.get(event.data.messageId);
    if (streamingMessage) {
      if (!this._model.updateMessage) {
        streamingMessage.update({ body: event.data.content });
      } else {
        this._model.updateMessage(streamingMessage.id, {
          ...streamingMessage.content,
          body: event.data.content
        });
      }

      this._streamingMessage.delete(event.data.messageId);
    }
  }

  private async _handleToolCallStart(
    event: IAgentManager.IAgentEvent<'tool_call_start'>
  ): Promise<void> {
    // Pre-register a buffer so any events that arrive while sendMessage is
    // in-flight are queued rather than dropped.
    this._toolEventBuffer.set(event.data.callId, []);

    const summary = extractToolSummary(event.data.toolName, event.data.input);
    const shouldAutoRenderMimeBundles =
      this._computeShouldAutoRenderMimeBundles(
        event.data.toolName,
        event.data.input
      );
    const context: IToolExecutionContext = {
      toolCallId: event.data.callId,
      messageId: '',
      toolName: event.data.toolName,
      title: event.data.title,
      input: event.data.input,
      status: 'in_progress',
      summary,
      shouldAutoRenderMimeBundles
    };

    const displayName = context.title ?? context.toolName;
    const messageId = await this._model.sendMessage({
      body: '',
      mime_model: {
        data: {
          'application/vnd.jupyter.chat.components': 'grouped-tool-calls'
        },
        metadata: {
          toolCalls: [
            {
              toolCallId: context.toolCallId,
              title: context.summary
                ? `${displayName} : ${context.summary}`
                : displayName,
              kind: context.toolName,
              status: 'in_progress',
              rawInput: context.input
            }
          ]
        }
      },
      sender: this._persona
    });

    if (messageId) {
      await this._waitForMessage(messageId);
      context.messageId = messageId;
      this._toolContexts.set(event.data.callId, context);
      const buffered = this._toolEventBuffer.get(event.data.callId) ?? [];
      this._toolEventBuffer.delete(event.data.callId);
      for (const bufferedEvent of buffered) {
        if (bufferedEvent.type === 'tool_call_complete') {
          this._handleToolCallComplete(bufferedEvent);
        } else if (bufferedEvent.type === 'tool_approval_request') {
          this._handleToolApprovalRequest(bufferedEvent);
        } else {
          this._handleToolApprovalResolved(bufferedEvent);
        }
      }
      return;
    }
    this._toolEventBuffer.delete(event.data.callId);
  }

  private _handleToolCallComplete(
    event: IAgentManager.IAgentEvent<'tool_call_complete'>
  ): void {
    if (this._toolEventBuffer.has(event.data.callId)) {
      this._toolEventBuffer.get(event.data.callId)!.push(event);
      return;
    }
    const context = this._toolContexts.get(event.data.callId);
    const status = event.data.isError ? 'failed' : 'completed';
    this._updateToolCallUI(
      event.data.callId,
      status,
      formatToolOutput(event.data.outputData)
    );

    if (!event.data.isError && context?.shouldAutoRenderMimeBundles) {
      const trustedMimeTypes = new Set(
        this._settingsModel.config.trustedMimeTypesForAutoRender
      );
      for (const bundle of extractMimeBundles(
        event.data.outputData,
        trustedMimeTypes
      )) {
        this._model.sendMessage({
          body: '',
          mime_model: bundle,
          sender: this._persona
        });
      }
    }

    this._toolContexts.delete(event.data.callId);
  }

  private _computeShouldAutoRenderMimeBundles(
    toolName: string,
    input: string
  ): boolean {
    if (toolName !== 'execute_command') {
      return false;
    }
    try {
      const parsed = JSON.parse(input);
      return (
        typeof parsed.commandId === 'string' &&
        this._settingsModel.config.commandsAutoRenderMimeBundles.includes(
          parsed.commandId
        )
      );
    } catch {
      return false;
    }
  }

  private _handleToolApprovalRequest(
    event: IAgentManager.IAgentEvent<'tool_approval_request'>
  ): void {
    if (this._toolEventBuffer.has(event.data.toolCallId)) {
      this._toolEventBuffer.get(event.data.toolCallId)!.push(event);
      return;
    }
    const context = this._toolContexts.get(event.data.toolCallId);
    if (!context) {
      return;
    }
    context.input = JSON.stringify(event.data.args, null, 2);
    this._updateToolCallUI(event.data.toolCallId, 'awaiting_approval');
  }

  private _handleToolApprovalResolved(
    event: IAgentManager.IAgentEvent<'tool_approval_resolved'>
  ): void {
    if (this._toolEventBuffer.has(event.data.toolCallId)) {
      this._toolEventBuffer.get(event.data.toolCallId)!.push(event);
      return;
    }
    const context = this._toolContexts.get(event.data.toolCallId);
    if (!context) {
      return;
    }
    const status = event.data.approved ? 'in_progress' : 'rejected';
    this._updateToolCallUI(event.data.toolCallId, status);
    if (!event.data.approved) {
      this._toolContexts.delete(event.data.toolCallId);
    }
  }

  private _handleError(event: IAgentManager.IAgentEvent<'error'>): void {
    this._model.sendMessage({
      body: '',
      mime_model: {
        data: { 'application/vnd.jupyter.chat.components': 'error' },
        metadata: {
          errorMessage: `Error generating response: ${event.data.error.message}`
        }
      },
      sender: this._persona
    });
  }

  private _updateToolCallUI(
    toolCallId: string,
    status: ToolStatus,
    output?: string
  ): void {
    const context = this._toolContexts.get(toolCallId);
    if (!context) {
      return;
    }
    const message = this._model.messages.find(m => m.id === context.messageId);
    if (!message) {
      return;
    }
    context.status = status;
    const displayName = context.title ?? context.toolName;
    const mime_model = {
      data: {
        'application/vnd.jupyter.chat.components': 'grouped-tool-calls'
      },
      metadata: {
        toolCalls: [
          {
            toolCallId: context.toolCallId,
            title: context.summary
              ? `${displayName} : ${context.summary}`
              : displayName,
            kind: context.toolName,
            status: context.status,
            rawInput: context.input,
            rawOutput: output,
            targetId: this._model.name,
            permissionStatus:
              status === 'awaiting_approval' ? 'pending' : 'resolved',
            ...(status === 'awaiting_approval' && {
              permissionOptions: [
                { optionId: 'approve', name: 'Approve', kind: 'allow_once' },
                { optionId: 'reject', name: 'Reject', kind: 'reject_once' }
              ]
            })
          }
        ]
      }
    };
    if (!this._model.updateMessage) {
      message.update({ mime_model });
    } else {
      this._model.updateMessage(message.id, {
        ...message.content,
        mime_model
      });
    }
  }

  sendSystemMessage(body: string): void {
    this._model.sendMessage({
      body,
      sender: this._persona
    });
  }

  /**
   * Whether a mention is required to trigger a response.
   * When false, the persona responds to all non-bot messages.
   * Defaults to true.
   */
  requireMention: boolean = true;

  private readonly _model: IChatModel;
  private readonly _agent: IAgentManager;
  private readonly _persona: IUser;
  private readonly _settingsModel: IAISettingsModel;
  private readonly _providerRegistry: IProviderRegistry | undefined;
  private readonly _documentManager: IDocumentManager | undefined;
  private _respondedToIds = new Set<string>();
  private _currentModelKey: string | undefined;
  private _busy = false;
  private _busyChanged = new Signal<IPersona, boolean>(this);
  private _streamingMessage = new Map<string, IMessage>();
  private _toolContexts = new Map<string, IToolExecutionContext>();

  // Event buffers used until messages are inserted in the list.
  // In WebSocket chats, for example, messages are inserted only after they are
  // broadcast by the server, so updates arriving between sending a message and
  // its actual insertion would otherwise not be applied.
  private _eventBuffer = new Map<
    string,
    Array<
      | IAgentManager.IAgentEvent<'message_chunk'>
      | IAgentManager.IAgentEvent<'message_complete'>
    >
  >();
  private _toolEventBuffer = new Map<
    string,
    Array<
      | IAgentManager.IAgentEvent<'tool_call_complete'>
      | IAgentManager.IAgentEvent<'tool_approval_request'>
      | IAgentManager.IAgentEvent<'tool_approval_resolved'>
    >
  >();
}

export namespace Persona {
  export interface IOptions {
    model: IChatModel;
    agentManager: IAgentManager;
    persona: IUser;
    settingsModel: IAISettingsModel;
    providerRegistry?: IProviderRegistry;
    documentManager?: IDocumentManager;
  }
}
