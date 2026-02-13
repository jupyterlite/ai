import {
  AbstractChatModel,
  IActiveCellManager,
  IAttachment,
  IChatContext,
  IMessageContent,
  INewMessage,
  IUser
} from '@jupyter/chat';

import { PathExt } from '@jupyterlab/coreutils';

import { IDocumentManager } from '@jupyterlab/docmanager';

import { IDocumentWidget } from '@jupyterlab/docregistry';

import { INotebookModel, Notebook } from '@jupyterlab/notebook';

import { TranslationBundle } from '@jupyterlab/translation';

import { UUID } from '@lumino/coreutils';

import { ISignal, Signal } from '@lumino/signaling';

import { AgentManager, IAgentEvent } from './agent';

import { AI_AVATAR } from './icons';

import { AISettingsModel } from './models/settings-model';

import { ITokenUsage } from './tokens';

import { YNotebook } from '@jupyter/ydoc';

import * as nbformat from '@jupyterlab/nbformat';

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
    this._trans = options.trans;

    // Listen for agent events
    this._agentManager.agentEvent.connect(this._onAgentEvent, this);

    // Listen for settings changes to update chat behavior
    this._settingsModel.stateChanged.connect(this._onSettingsChanged, this);
    this.setReady();
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
  get tokenUsageChanged(): ISignal<AgentManager, ITokenUsage> {
    return this._agentManager.tokenUsageChanged;
  }

  /**
   * Get the agent manager associated to the model.
   */
  get agentManager(): AgentManager {
    return this._agentManager;
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
      let enhancedMessage = message.body;
      if (this.input.attachments.length > 0) {
        const attachmentContents = await this._processAttachments(
          this.input.attachments
        );
        this.input.clearAttachments();

        if (attachmentContents.length > 0) {
          enhancedMessage +=
            '\n\n--- Attached Files ---\n' + attachmentContents.join('\n\n');
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
  private _onAgentEvent(_sender: AgentManager, event: IAgentEvent): void {
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
  private _handleMessageStart(event: IAgentEvent<'message_start'>): void {
    const aiMessage: IMessageContent = {
      body: '',
      sender: this._getAIUser(),
      id: event.data.messageId,
      time: Date.now() / 1000,
      type: 'msg',
      raw_time: false
    };
    this._currentStreamingMessage = aiMessage;
    this.messageAdded(aiMessage);
  }

  /**
   * Handles streaming message chunks from the AI agent.
   * @param event Event containing the message chunk data
   */
  private _handleMessageChunk(event: IAgentEvent<'message_chunk'>): void {
    if (
      this._currentStreamingMessage &&
      this._currentStreamingMessage.id === event.data.messageId
    ) {
      this._currentStreamingMessage.body = event.data.fullContent;
      this.messageAdded(this._currentStreamingMessage);
    }
  }

  /**
   * Handles the completion of a message from the AI agent.
   * @param event Event containing the message completion data
   */
  private _handleMessageComplete(event: IAgentEvent<'message_complete'>): void {
    if (
      this._currentStreamingMessage &&
      this._currentStreamingMessage.id === event.data.messageId
    ) {
      this._currentStreamingMessage.body = event.data.content;
      this.messageAdded(this._currentStreamingMessage);
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
   * Handles the start of a tool call execution.
   * @param event Event containing the tool call start data
   */
  private _handleToolCallStartEvent(
    event: IAgentEvent<'tool_call_start'>
  ): void {
    const messageId = UUID.uuid4();
    const summary = this._extractToolSummary(
      event.data.toolName,
      event.data.input
    );
    const context: IToolExecutionContext = {
      toolCallId: event.data.callId,
      messageId,
      toolName: event.data.toolName,
      input: event.data.input,
      status: 'pending',
      summary
    };

    this._toolContexts.set(event.data.callId, context);

    const toolCallMessage: IMessageContent = {
      body: Private.buildToolCallHtml({
        toolName: context.toolName,
        input: context.input,
        status: context.status,
        summary: context.summary,
        trans: this._trans
      }),
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
    event: IAgentEvent<'tool_call_complete'>
  ): void {
    const status = event.data.isError ? 'error' : 'completed';
    this._updateToolCallUI(event.data.callId, status, event.data.output);
    this._toolContexts.delete(event.data.callId);
  }

  /**
   * Handles error events from the AI agent.
   */
  private _handleErrorEvent(event: IAgentEvent<'error'>): void {
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
    event: IAgentEvent<'tool_approval_request'>
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
    event: IAgentEvent<'tool_approval_resolved'>
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
      body: Private.buildToolCallHtml({
        toolName: context.toolName,
        input: context.input,
        status: context.status,
        summary: context.summary,
        output,
        approvalId: context.approvalId,
        trans: this._trans
      })
    });
  }

  /**
   * Processes file attachments and returns their content as formatted strings.
   * @param attachments Array of file attachments to process
   * @returns Array of formatted attachment contents
   */
  private async _processAttachments(
    attachments: IAttachment[]
  ): Promise<string[]> {
    const contents: string[] = [];

    for (const attachment of attachments) {
      try {
        if (attachment.type === 'notebook' && attachment.cells?.length) {
          const cellContents = await this._readNotebookCells(attachment);
          if (cellContents) {
            contents.push(cellContents);
          }
        } else {
          const fileContent = await this._readFileAttachment(attachment);
          if (fileContent) {
            const fileExtension = PathExt.extname(
              attachment.value
            ).toLowerCase();
            const language = fileExtension === '.ipynb' ? 'json' : '';
            contents.push(
              `**File: ${attachment.value}**\n\`\`\`${language}\n${fileContent}\n\`\`\``
            );
          }
        }
      } catch (error) {
        console.warn(`Failed to read attachment ${attachment.value}:`, error);
        contents.push(`**File: ${attachment.value}** (Could not read file)`);
      }
    }

    return contents;
  }

  /**
   * Reads the content of a notebook cell.
   * @param attachment The notebook attachment to read
   * @returns Cell content as string or null if unable to read
   */
  private async _readNotebookCells(
    attachment: IAttachment
  ): Promise<string | null> {
    if (attachment.type !== 'notebook' || !attachment.cells) {
      return null;
    }

    try {
      // Try reading from live notebook if open
      const widget = this.input.documentManager?.findWidget(
        attachment.value
      ) as IDocumentWidget<Notebook, INotebookModel> | undefined;
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
        const model = await this.input.documentManager?.services.contents.get(
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
   * @returns File content as string or null if unable to read
   */
  private async _readFileAttachment(
    attachment: IAttachment
  ): Promise<string | null> {
    // Handle both 'file' and 'notebook' types since both have a 'value' path
    if (attachment.type !== 'file' && attachment.type !== 'notebook') {
      return null;
    }

    try {
      // Try reading from an open widget first
      const widget = this.input.documentManager?.findWidget(
        attachment.value
      ) as IDocumentWidget<Notebook, INotebookModel> | undefined;

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
      const diskModel = await this.input.documentManager?.services.contents.get(
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

  // Private fields
  private _settingsModel: AISettingsModel;
  private _user: IUser;
  private _toolContexts: Map<string, IToolExecutionContext> = new Map();
  private _agentManager: AgentManager;
  private _currentStreamingMessage: IMessageContent | null = null;
  private _nameChanged = new Signal<AIChatModel, string>(this);
  private _trans: TranslationBundle;
}

namespace Private {
  export function escapeHtml(value: string): string {
    // Prefer the same native escaping approach used in JupyterLab itself
    // (e.g. `@jupyterlab/completer`).
    if (typeof document !== 'undefined') {
      const node = document.createElement('span');
      node.textContent = value;
      return node.innerHTML;
    }

    // Fallback
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Configuration for rendering tool call status.
   */
  interface IStatusConfig {
    cssClass: string;
    statusClass: string;
    open?: boolean;
  }

  const STATUS_CONFIG: Record<ToolStatus, IStatusConfig> = {
    pending: {
      cssClass: 'jp-ai-tool-pending',
      statusClass: 'jp-ai-tool-status-pending'
    },
    awaiting_approval: {
      cssClass: 'jp-ai-tool-pending',
      statusClass: 'jp-ai-tool-status-approval',
      open: true
    },
    approved: {
      cssClass: 'jp-ai-tool-pending',
      statusClass: 'jp-ai-tool-status-completed'
    },
    rejected: {
      cssClass: 'jp-ai-tool-error',
      statusClass: 'jp-ai-tool-status-error'
    },
    completed: {
      cssClass: 'jp-ai-tool-completed',
      statusClass: 'jp-ai-tool-status-completed'
    },
    error: {
      cssClass: 'jp-ai-tool-error',
      statusClass: 'jp-ai-tool-status-error'
    }
  };

  /**
   * Returns the translated status text for a given tool status.
   */
  const getStatusText = (
    status: ToolStatus,
    trans: TranslationBundle
  ): string => {
    switch (status) {
      case 'pending':
        return trans.__('Running...');
      case 'awaiting_approval':
        return trans.__('Awaiting Approval');
      case 'approved':
        return trans.__('Approved - Executing...');
      case 'rejected':
        return trans.__('Rejected');
      case 'completed':
        return trans.__('Completed');
      case 'error':
        return trans.__('Error');
    }
  };

  /**
   * Options for building tool call HTML.
   */
  interface IToolCallHtmlOptions {
    toolName: string;
    input: string;
    status: ToolStatus;
    summary?: string;
    output?: string;
    approvalId?: string;
    trans: TranslationBundle;
  }

  /**
   * Builds HTML for a tool call display.
   */
  export function buildToolCallHtml(options: IToolCallHtmlOptions): string {
    const { toolName, input, status, summary, output, approvalId, trans } =
      options;
    const config = STATUS_CONFIG[status];
    const statusText = getStatusText(status, trans);
    const escapedToolName = escapeHtml(toolName);
    const escapedInput = escapeHtml(input);
    const openAttr = config.open ? ' open' : '';
    const summaryHtml = summary
      ? `<span class="jp-ai-tool-summary">${escapeHtml(summary)}</span>`
      : '';

    let bodyContent = `
<div class="jp-ai-tool-section">
<div class="jp-ai-tool-label">${trans.__('Input')}</div>
<pre class="jp-ai-tool-code"><code>${escapedInput}</code></pre>
</div>`;

    // Add approval buttons if awaiting approval
    if (status === 'awaiting_approval' && approvalId) {
      bodyContent += `
<div class="jp-ai-tool-approval-buttons jp-ai-approval-id--${approvalId}">
<button class="jp-ai-approval-btn jp-ai-approval-approve">${trans.__('Approve')}</button>
<button class="jp-ai-approval-btn jp-ai-approval-reject">${trans.__('Reject')}</button>
</div>`;
    }

    // Add output/result section if provided
    if (output !== undefined) {
      const escapedOutput = escapeHtml(output);
      const label = status === 'error' ? trans.__('Error') : trans.__('Result');
      bodyContent += `
<div class="jp-ai-tool-section">
<div class="jp-ai-tool-label">${label}</div>
<pre class="jp-ai-tool-code"><code>${escapedOutput}</code></pre>
</div>`;
    }

    return `<details class="jp-ai-tool-call ${config.cssClass}"${openAttr}>
<summary class="jp-ai-tool-header">
<div class="jp-ai-tool-icon">⚡</div>
<div class="jp-ai-tool-title">${escapedToolName}${summaryHtml}</div>
<div class="jp-ai-tool-status ${config.statusClass}">${statusText}</div>
</summary>
<div class="jp-ai-tool-body">${bodyContent}
</div>
</details>`;
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
    settingsModel: AISettingsModel;
    /**
     * Optional agent manager for handling AI agent lifecycle
     */
    agentManager: AgentManager;
    /**
     * Optional active cell manager for Jupyter integration
     */
    activeCellManager?: IActiveCellManager;
    /**
     * Optional document manager for file operations
     */
    documentManager?: IDocumentManager;
    /**
     * The application language translation bundle.
     */
    trans: TranslationBundle;
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
    agentManager: AgentManager;
  }
}
