import {
  IAttachment,
  IMessage,
  IMessageContent,
  IChatModel,
  IUser
} from '@jupyter/chat';

import type { IDocumentManager } from '@jupyterlab/docmanager';

import type {
  IAgentManager,
  IAISettingsModel,
  IProviderRegistry
} from '@jupyternaut/agent';

import {
  modelSupportsAudio,
  modelSupportsImages,
  modelSupportsPdf
} from '@jupyternaut/agent';

import { UUID } from '@lumino/coreutils';

import type { IObservableDisposable } from '@lumino/disposable';

import { ISignal, Signal } from '@lumino/signaling';

import type { UserContent } from 'ai';

import { processAttachments } from './process-attachments';

import type { IPersona } from './tokens';

type ToolStatus =
  | 'pending'
  | 'awaiting_approval'
  | 'approved'
  | 'rejected'
  | 'completed'
  | 'error';

interface IToolExecutionContext {
  toolCallId: string;
  messageId: string;
  toolName: string;
  input: string;
  status: ToolStatus;
  summary?: string;
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

    for (const message of options.model.messages) {
      this._respondedToIds.add(message.id);
    }

    this._agent.agentEvent.connect(this._onAgentEvent, this);
    this._model.messagesUpdated.connect(this._onMessagesUpdated, this);
    (this._model as unknown as IObservableDisposable).disposed.connect(
      this.dispose,
      this
    );
  }

  dispose(): void {
    this._agent.agentEvent.disconnect(this._onAgentEvent, this);
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
        !this._respondedToIds.has(m.id) &&
        m.mentions?.includes(this._persona) &&
        !m.sender.bot
    );

    for (const message of unhandled) {
      this._respondedToIds.add(message.id);
    }

    for (const message of unhandled) {
      const personaMention = `@${this._persona.mention_name}`;
      const body = message.body.replace(personaMention, '').trim();
      await this._respond(body || message.body, message.attachments);
    }
  }

  private async _respond(
    body: string,
    attachments?: IAttachment[]
  ): Promise<void> {
    this._busy = true;
    this._busyChanged.emit(true);
    this._model.updateWriters([{ user: this._persona }]);
    try {
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

  private _handleMessageStart(
    event: IAgentManager.IAgentEvent<'message_start'>
  ): void {
    const message: IMessageContent = {
      body: '',
      sender: this._persona,
      id: event.data.messageId,
      time: Date.now() / 1000,
      type: 'msg',
      raw_time: false
    };
    this._model.messageAdded(message);
    this._streamingMessage =
      this._model.messages.find(m => m.id === event.data.messageId) ?? null;
  }

  private _handleMessageChunk(
    event: IAgentManager.IAgentEvent<'message_chunk'>
  ): void {
    if (this._streamingMessage?.id === event.data.messageId) {
      this._streamingMessage.update({ body: event.data.fullContent });
    }
  }

  private _handleMessageComplete(
    event: IAgentManager.IAgentEvent<'message_complete'>
  ): void {
    if (this._streamingMessage?.id === event.data.messageId) {
      this._streamingMessage.update({ body: event.data.content });
      this._streamingMessage = null;
    }
  }

  private _handleToolCallStart(
    event: IAgentManager.IAgentEvent<'tool_call_start'>
  ): void {
    const messageId = UUID.uuid4();
    const summary = extractToolSummary(event.data.toolName, event.data.input);
    const context: IToolExecutionContext = {
      toolCallId: event.data.callId,
      messageId,
      toolName: event.data.toolName,
      input: event.data.input,
      status: 'pending',
      summary
    };
    this._toolContexts.set(event.data.callId, context);

    this._model.messageAdded({
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
                ? `${context.toolName} : ${context.summary}`
                : context.toolName,
              kind: context.toolName,
              status: 'in_progress',
              rawInput: context.input
            }
          ]
        }
      },
      sender: this._persona,
      id: messageId,
      time: Date.now() / 1000,
      type: 'msg',
      raw_time: false
    });
  }

  private _handleToolCallComplete(
    event: IAgentManager.IAgentEvent<'tool_call_complete'>
  ): void {
    const status = event.data.isError ? 'error' : 'completed';
    this._updateToolCallUI(
      event.data.callId,
      status,
      formatToolOutput(event.data.outputData)
    );
    this._toolContexts.delete(event.data.callId);
  }

  private _handleToolApprovalRequest(
    event: IAgentManager.IAgentEvent<'tool_approval_request'>
  ): void {
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
    const context = this._toolContexts.get(event.data.toolCallId);
    if (!context) {
      return;
    }
    const status = event.data.approved ? 'approved' : 'rejected';
    this._updateToolCallUI(event.data.toolCallId, status);
    if (!event.data.approved) {
      this._toolContexts.delete(event.data.toolCallId);
    }
  }

  private _handleError(event: IAgentManager.IAgentEvent<'error'>): void {
    this._model.messageAdded({
      body: '',
      mime_model: {
        data: { 'application/vnd.jupyter.chat.components': 'error' },
        metadata: {
          errorMessage: `Error generating response: ${event.data.error.message}`
        }
      },
      sender: this._persona,
      id: UUID.uuid4(),
      time: Date.now() / 1000,
      type: 'msg',
      raw_time: false
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
    message.update({
      mime_model: {
        data: {
          'application/vnd.jupyter.chat.components': 'grouped-tool-calls'
        },
        metadata: {
          toolCalls: [
            {
              toolCallId: context.toolCallId,
              title: context.summary
                ? `${context.toolName} : ${context.summary}`
                : context.toolName,
              kind: context.toolName,
              status: context.status,
              rawInput: context.input,
              rawOutput: output,
              sessionId: this._model.name,
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
      }
    });
  }

  private readonly _model: IChatModel;
  private readonly _agent: IAgentManager;
  private readonly _persona: IUser;
  private readonly _settingsModel: IAISettingsModel;
  private readonly _providerRegistry: IProviderRegistry | undefined;
  private readonly _documentManager: IDocumentManager | undefined;
  private _respondedToIds = new Set<string>();
  private _busy = false;
  private _busyChanged = new Signal<IPersona, boolean>(this);
  private _streamingMessage: IMessage | null = null;
  private _toolContexts = new Map<string, IToolExecutionContext>();
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
