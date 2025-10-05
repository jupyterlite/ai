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

import { UUID } from '@lumino/coreutils';

import { ISignal, Signal } from '@lumino/signaling';

import { AgentManager, IAgentEvent } from './agent';

import { AI_AVATAR } from './icons';

import { AISettingsModel } from './models/settings-model';

import { ITokenUsage } from './tokens';

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
      attachments: this.input.attachments
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
        if (attachmentContents.length > 0) {
          enhancedMessage +=
            '\n\n--- Attached Files ---\n' + attachmentContents.join('\n\n');
        }
      }

      this.updateWriters([{ user: this._getAIUser() }]);

      await this._agentManager.generateResponse(enhancedMessage);
      // Clear attachments after processing
      this.input.clearAttachments();
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
   * Approves a tool call and updates the UI accordingly.
   * @param interruptionId The interruption ID to approve
   * @param messageId Optional message ID for UI updates
   */
  async approveToolCall(
    interruptionId: string,
    messageId?: string
  ): Promise<void> {
    await this._agentManager.approveToolCall(interruptionId);

    // Update the tool call box to show "Approved" status
    if (messageId) {
      this._updateToolCallBoxStatus(messageId, 'Approved', true);
    }
  }

  /**
   * Rejects a tool call and updates the UI accordingly.
   * @param interruptionId The interruption ID to reject
   * @param messageId Optional message ID for UI updates
   */
  async rejectToolCall(
    interruptionId: string,
    messageId?: string
  ): Promise<void> {
    await this._agentManager.rejectToolCall(interruptionId);

    // Update the tool call box to show "Rejected" status
    if (messageId) {
      this._updateToolCallBoxStatus(messageId, 'Rejected', false);
    }
  }

  /**
   * Approves all tools in a group.
   * @param groupId The group ID containing the tool calls
   * @param interruptionIds Array of interruption IDs to approve
   * @param messageId Optional message ID for UI updates
   */
  async approveGroupedToolCalls(
    groupId: string,
    interruptionIds: string[],
    messageId?: string
  ): Promise<void> {
    await this._agentManager.approveGroupedToolCalls(groupId, interruptionIds);

    // Update the grouped approval message to show approved status
    if (messageId) {
      this._updateGroupedApprovalStatus(messageId, 'Tools approved', true);
    }
  }

  /**
   * Rejects all tools in a group.
   * @param groupId The group ID containing the tool calls
   * @param interruptionIds Array of interruption IDs to reject
   * @param messageId Optional message ID for UI updates
   */
  async rejectGroupedToolCalls(
    groupId: string,
    interruptionIds: string[],
    messageId?: string
  ): Promise<void> {
    await this._agentManager.rejectGroupedToolCalls(groupId, interruptionIds);

    // Update the grouped approval message to show rejected status
    if (messageId) {
      this._updateGroupedApprovalStatus(messageId, 'Tools rejected', false);
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
    this.config = {
      ...config,
      enableCodeToolbar: true
    };
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
      case 'tool_approval_required':
        this._handleToolApprovalRequired(event);
        break;
      case 'grouped_approval_required':
        this._handleGroupedApprovalRequired(event);
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
<pre class="jp-ai-tool-code"><code>${JSON.stringify(event.data.input, null, 2)}</code></pre>
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
   * Handles tool approval requests from the AI agent.
   * @param event Event containing the tool approval request data
   */
  private _handleToolApprovalRequired(
    event: IAgentEvent<'tool_approval_required'>
  ): void {
    // Handle single tool approval - either update existing tool call message or create new approval message
    if (event.data.callId) {
      const messageId = this._pendingToolCalls.get(event.data.callId);
      if (messageId) {
        const existingMessageIndex = this.messages.findIndex(
          msg => msg.id === messageId
        );
        if (existingMessageIndex !== -1) {
          const existingMessage = this.messages[existingMessageIndex];
          const assistantName = this._getAIUser().display_name;

          const updatedMessage: IChatMessage = {
            ...existingMessage,
            body: `<details class="jp-ai-tool-call jp-ai-tool-pending" open>
<summary class="jp-ai-tool-header">
<div class="jp-ai-tool-icon">⚡</div>
<div class="jp-ai-tool-title">${event.data.toolName}</div>
<div class="jp-ai-tool-status jp-ai-tool-status-pending">Needs Approval</div>
</summary>
<div class="jp-ai-tool-body">
<div class="jp-ai-tool-section">
<div class="jp-ai-tool-label">${assistantName} wants to execute this tool. Do you approve?</div>
<pre class="jp-ai-tool-code"><code>${JSON.stringify(event.data.toolInput, null, 2)}</code></pre>
</div>
[APPROVAL_BUTTONS:${event.data.interruptionId}]
</div>
</details>`
          };

          this.messageAdded(updatedMessage);
          this.updateWriters([]);
          return;
        }
      }
    }

    // Fallback: create separate approval message
    const approvalMessageId = UUID.uuid4();
    const assistantName = this._getAIUser().display_name;

    const approvalMessage: IChatMessage = {
      body: `**🤖 Tool Approval Required: ${event.data.toolName}**

${assistantName} wants to execute this tool. Do you approve?

${JSON.stringify(event.data.toolInput, null, 2)}

[APPROVAL_BUTTONS:${event.data.interruptionId}]`,
      sender: this._getAIUser(),
      id: approvalMessageId,
      time: Date.now() / 1000,
      type: 'msg',
      raw_time: false
    };

    this.messageAdded(approvalMessage);
    this.updateWriters([]); // Stop showing "AI is writing"
  }

  /**
   * Handles grouped tool approval requests from the AI agent.
   * @param event Event containing the grouped tool approval request data
   */
  private _handleGroupedApprovalRequired(
    event: IAgentEvent<'grouped_approval_required'>
  ): void {
    const assistantName = this._getAIUser().display_name;
    const approvalMessageId = UUID.uuid4();

    const toolsList = event.data.approvals
      .map(
        (info, index) =>
          `**${index + 1}. ${info.toolName}**\n${JSON.stringify(info.toolInput, null, 2)}\n`
      )
      .join('\n\n');

    const approvalMessage: IChatMessage = {
      body: `**🤖 Multiple Tool Approvals Required**

${assistantName} wants to execute ${event.data.approvals.length} tools. Do you approve?

${toolsList}

[GROUP_APPROVAL_BUTTONS:${event.data.groupId}:${event.data.approvals.map(info => info.interruptionId).join(',')}]`,
      sender: this._getAIUser(),
      id: approvalMessageId,
      time: Date.now() / 1000,
      type: 'msg',
      raw_time: false
    };

    this.messageAdded(approvalMessage);
    this.updateWriters([]); // Stop showing "AI is writing"
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
        const fileContent = await this._readFileAttachment(attachment);
        if (fileContent) {
          // Get file extension for syntax highlighting
          const fileExtension = PathExt.extname(attachment.value).toLowerCase();
          const language = fileExtension === '.ipynb' ? 'json' : '';
          contents.push(
            `**File: ${attachment.value}**\n\`\`\`${language}\n${fileContent}\n\`\`\``
          );
        }
      } catch (error) {
        console.warn(`Failed to read attachment ${attachment.value}:`, error);
        contents.push(`**File: ${attachment.value}** (Could not read file)`);
      }
    }

    return contents;
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
      const model = await this.input.documentManager?.services.contents.get(
        attachment.value
      );
      if (!model?.content) {
        return null;
      }
      if (model.type === 'file') {
        // Regular file content
        return model.content;
      } else if (model.type === 'notebook') {
        // Clear outputs from notebook cells before sending to LLM
        // TODO: make this configurable?
        const cells = model.content.cells.map((cell: any) => {
          const cleanCell = { ...cell };
          if (cleanCell.outputs) {
            cleanCell.outputs = [];
          }
          if (cleanCell.execution_count) {
            cleanCell.execution_count = null;
          }
          return cleanCell;
        });

        const notebookModel = {
          cells,
          metadata: (model as any).metadata || {},
          nbformat: (model as any).nbformat || 4,
          nbformat_minor: (model as any).nbformat_minor || 4
        };
        return JSON.stringify(notebookModel);
      }
      return null;
    } catch (error) {
      console.warn(`Failed to read file ${attachment.value}:`, error);
      return null;
    }
  }

  /**
   * Updates the status display of a grouped approval message.
   * @param messageId The message ID to update
   * @param status The status text to display
   * @param isSuccess Whether the action was successful
   */
  private _updateGroupedApprovalStatus(
    messageId: string,
    status: string,
    isSuccess: boolean
  ): void {
    const existingMessageIndex = this.messages.findIndex(
      msg => msg.id === messageId
    );
    if (existingMessageIndex !== -1) {
      const existingMessage = this.messages[existingMessageIndex];

      // Extract tool count and names from existing message
      const toolCountMatch = existingMessage.body.match(/execute (\d+) tools/);
      const toolCount = toolCountMatch ? toolCountMatch[1] : 'multiple';

      const statusIcon = isSuccess ? '✅' : '❌';
      const statusClass = isSuccess ? 'approved' : 'rejected';

      const updatedMessage: IChatMessage = {
        ...existingMessage,
        body: `**${statusIcon} Group Tool Approval: ${status}**

The request to execute ${toolCount} tools has been **${statusClass}**.

<div class="jp-ai-group-approval-${statusClass}">
Status: ${status}
</div>`
      };

      this.messageAdded(updatedMessage);
    }
  }

  /**
   * Updates the status display of a tool call box.
   * @param messageId The message ID to update
   * @param status The status text to display
   * @param isSuccess Whether the action was successful
   */
  private _updateToolCallBoxStatus(
    messageId: string,
    status: string,
    isSuccess: boolean
  ): void {
    const existingMessageIndex = this.messages.findIndex(
      msg => msg.id === messageId
    );
    if (existingMessageIndex !== -1) {
      const existingMessage = this.messages[existingMessageIndex];

      // Extract tool name and input from existing message
      const toolNameMatch = existingMessage.body.match(
        /<div class="jp-ai-tool-title">([^<]+)<\/div>/
      );
      const toolName = toolNameMatch ? toolNameMatch[1] : 'Unknown Tool';

      const codeMatch = existingMessage.body.match(/<code>([\s\S]*?)<\/code>/);
      const toolInput = codeMatch ? codeMatch[1] : '{}';

      // Determine styling based on status
      const statusClass = isSuccess
        ? 'jp-ai-tool-completed'
        : 'jp-ai-tool-error';
      const statusColor = isSuccess
        ? 'jp-ai-tool-status-completed'
        : 'jp-ai-tool-status-error';

      const updatedMessage: IChatMessage = {
        ...existingMessage,
        body: `<details class="jp-ai-tool-call ${statusClass}">
<summary class="jp-ai-tool-header">
<div class="jp-ai-tool-icon">⚡</div>
<div class="jp-ai-tool-title">${toolName}</div>
<div class="jp-ai-tool-status ${statusColor}">${status}</div>
</summary>
<div class="jp-ai-tool-body">
<div class="jp-ai-tool-section">
<div class="jp-ai-tool-label">Input</div>
<pre class="jp-ai-tool-code"><code>${toolInput}</code></pre>
</div>
</div>
</details>`
      };

      this.messageAdded(updatedMessage);
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
