import {
  IAttachment,
  IMessage,
  IMessageContent,
  IChatModel
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

import type { UserContent } from 'ai';

import { processAttachments } from './process-attachments';

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

const PERSONA_USER = {
  username: 'jupyternaut-frontend',
  display_name: 'Jupyternaut',
  initials: 'JF',
  bot: true
};

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
export class PersonaHandler {
  constructor(options: PersonaHandler.IOptions) {
    this._model = options.model;
    this._agent = options.agentManager;
    this._trigger = options.trigger;
    this._settingsModel = options.settingsModel;
    this._providerRegistry = options.providerRegistry;
    this._documentManager = options.documentManager;
    this._previousCount = options.model.messages.length;

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

  private _onMessagesUpdated(): void {
    console.log('message updated');
    const messages = this._model.messages;
    const newMessages = messages.slice(this._previousCount);
    this._previousCount = messages.length;

    for (const message of newMessages) {
      console.log('MESSAGE', message);
      console.log(message.body.includes(this._trigger));
      if (message.body.includes(this._trigger) && !message.sender.bot) {
        const body = message.body.replace(this._trigger, '').trim();
        void this._respond(body || message.body, message.attachments);
      }
    }
  }

  private async _respond(
    body: string,
    attachments?: IAttachment[]
  ): Promise<void> {
    if (this._busy) {
      return;
    }
    this._busy = true;
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
      console.error('PersonaHandler: error generating response', error);
    } finally {
      this._busy = false;
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
      sender: PERSONA_USER,
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
      sender: PERSONA_USER,
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
      sender: PERSONA_USER,
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
  private readonly _trigger: string;
  private readonly _settingsModel: IAISettingsModel;
  private readonly _providerRegistry: IProviderRegistry | undefined;
  private readonly _documentManager: IDocumentManager | undefined;
  private _previousCount: number;
  private _busy = false;
  private _streamingMessage: IMessage | null = null;
  private _toolContexts = new Map<string, IToolExecutionContext>();
}

export namespace PersonaHandler {
  export interface IOptions {
    model: IChatModel;
    agentManager: IAgentManager;
    trigger: string;
    settingsModel: IAISettingsModel;
    providerRegistry?: IProviderRegistry;
    documentManager?: IDocumentManager;
  }
}
