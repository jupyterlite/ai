import {
  AbstractChatModel,
  IActiveCellManager,
  IAttachment,
  IChatContext,
  IChatMessage,
  INewMessage,
  IUser
} from '@jupyter/chat';

import { PathExt } from '@jupyterlab/coreutils';

import { IDocumentManager } from '@jupyterlab/docmanager';

import { IDocumentWidget } from '@jupyterlab/docregistry';

import { INotebookModel, Notebook } from '@jupyterlab/notebook';

import { UUID } from '@lumino/coreutils';

import { ISignal, Signal } from '@lumino/signaling';

import { AgentManager, IAgentEvent } from './agent';

import { AI_AVATAR } from './icons';

import { AISettingsModel } from './models/settings-model';

import { ITokenUsage } from './tokens';

import { YNotebook } from '@jupyter/ydoc';

import * as nbformat from '@jupyterlab/nbformat';

/**
 * AI Chat Model implementation that provides chat functionality with OpenAI agents,
 * tool integration, and MCP server support.
 * Extends the base AbstractChatModel to provide AI-powered conversations.
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
      agentManager: this._agentManager
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
    this._pendingToolCalls.clear();
    this._agentManager.clearHistory();
  };

  /**
   * Sends a message to the AI and generates a response.
   * @param message The user message to send
   */
  async sendMessage(message: INewMessage): Promise<void> {
    // Add user message to chat
    const userMessage: IChatMessage = {
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
      const errorMessage: IChatMessage = {
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
        // Clear attachments right after  processing
        this.input.clearAttachments();

        if (attachmentContents.length > 0) {
          enhancedMessage +=
            '\n\n--- Attached Files ---\n' + attachmentContents.join('\n\n');
        }
      }

      this.updateWriters([{ user: this._getAIUser() }]);

      await this._agentManager.generateResponse(enhancedMessage);
    } catch (error) {
      const errorMessage: IChatMessage = {
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
    const aiMessage: IChatMessage = {
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
   * Handles the start of a tool call execution.
   * @param event Event containing the tool call start data
   */
  private _handleToolCallStartEvent(
    event: IAgentEvent<'tool_call_start'>
  ): void {
    const toolCallMessageId = UUID.uuid4();
    const toolCallMessage: IChatMessage = {
      body: `<details class="jp-ai-tool-call jp-ai-tool-pending">
<summary class="jp-ai-tool-header">
<div class="jp-ai-tool-icon">⚡</div>
<div class="jp-ai-tool-title">${event.data.toolName}</div>
<div class="jp-ai-tool-status jp-ai-tool-status-pending">Running...</div>
</summary>
<div class="jp-ai-tool-body">
<div class="jp-ai-tool-section">
<div class="jp-ai-tool-label">Input</div>
<pre class="jp-ai-tool-code"><code>${event.data.input}</code></pre>
</div>
</div>
</details>`,
      sender: this._getAIUser(),
      id: toolCallMessageId,
      time: Date.now() / 1000,
      type: 'msg',
      raw_time: false
    };

    if (event.data.callId) {
      this._pendingToolCalls.set(event.data.callId, toolCallMessageId);
    }
    this.messageAdded(toolCallMessage);
  }

  /**
   * Handles the completion of a tool call execution.
   * @param event Event containing the tool call completion data
   */
  private _handleToolCallCompleteEvent(
    event: IAgentEvent<'tool_call_complete'>
  ): void {
    const messageId = this._pendingToolCalls.get(event.data.callId);
    if (messageId) {
      const existingMessageIndex = this.messages.findIndex(
        msg => msg.id === messageId
      );
      if (existingMessageIndex !== -1) {
        const existingMessage = this.messages[existingMessageIndex];
        const inputJson =
          existingMessage.body.match(/<code>([\s\S]*?)<\/code>/)?.[1] || '';

        const statusClass = event.data.isError
          ? 'jp-ai-tool-error'
          : 'jp-ai-tool-completed';
        const statusText = event.data.isError ? 'Error' : 'Completed';
        const statusColor = event.data.isError
          ? 'jp-ai-tool-status-error'
          : 'jp-ai-tool-status-completed';

        const updatedMessage: IChatMessage = {
          ...existingMessage,
          body: `<details class="jp-ai-tool-call ${statusClass}">
<summary class="jp-ai-tool-header">
<div class="jp-ai-tool-icon">⚡</div>
<div class="jp-ai-tool-title">${event.data.toolName}</div>
<div class="jp-ai-tool-status ${statusColor}">${statusText}</div>
</summary>
<div class="jp-ai-tool-body">
<div class="jp-ai-tool-section">
<div class="jp-ai-tool-label">Input</div>
<pre class="jp-ai-tool-code"><code>${inputJson}</code></pre>
</div>
<div class="jp-ai-tool-section">
<div class="jp-ai-tool-label">${event.data.isError ? 'Error' : 'Result'}</div>
<pre class="jp-ai-tool-code"><code>${event.data.output}</code></pre>
</div>
</div>
</details>`
        };

        this.messageAdded(updatedMessage);
        this._pendingToolCalls.delete(event.data.callId);
      }
    }
  }

  /**
   * Handles error events from the AI agent.
   * @param event Event containing the error information
   */
  private _handleErrorEvent(event: IAgentEvent<'error'>): void {
    const errorMessage: IChatMessage = {
      body: `Error generating response: ${event.data.error.message}`,
      sender: this._getAIUser(),
      id: UUID.uuid4(),
      time: Date.now() / 1000,
      type: 'msg',
      raw_time: false
    };
    this.messageAdded(errorMessage);
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
  private _pendingToolCalls: Map<string, string> = new Map();
  private _agentManager: AgentManager;
  private _currentStreamingMessage: IChatMessage | null = null;
  private _nameChanged = new Signal<AIChatModel, string>(this);
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
     * The agent manager of the chat.
     */
    agentManager: AgentManager;
  }
}
