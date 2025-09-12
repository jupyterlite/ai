import {
  settingsIcon,
  Toolbar,
  ToolbarButton
} from '@jupyterlab/ui-components';
import { CommandRegistry } from '@lumino/commands';
import { Panel, Widget } from '@lumino/widgets';
import { AIChatModel } from '../chat-model';
import { TokenUsageWidget } from '../components/token-usage-display';
import { AISettingsModel } from '../models/settings-model';

/**
 * CSS class for the chat toolbar
 */
const CHAT_TOOLBAR_CLASS = 'jp-LabAIChatToolbar';

/**
 * CSS class for the chat panel
 */
const CHAT_PANEL_CLASS = 'jp-LabAIChatPanel';

/**
 * A widget wrapper for the chat panel that provides toolbar functionality
 * and approval button handling for AI tool calls.
 */
export class ChatWrapperWidget extends Panel {
  /**
   * Constructs a new ChatWrapperWidget.
   *
   * @param options - Configuration options for the widget
   */
  constructor(options: ChatWrapperWidget.IOptions) {
    super();
    this._chatPanel = options.chatPanel;
    this._chatModel = options.chatModel;
    this._settingsModel = options.settingsModel;
    this._commands = options.commands;
    this._toolbar = this._createToolbar();

    this.id = 'labai:chat-wrapper';
    this.title.caption = 'Chat with AI assistant';
    this.title.icon = this._chatPanel.title.icon;

    this.addClass('jp-LabAIChatWrapper');

    this._toolbar.addClass(CHAT_TOOLBAR_CLASS);
    this._chatPanel.addClass(CHAT_PANEL_CLASS);

    // Add widgets to the panel
    this.addWidget(this._toolbar);
    this.addWidget(this._chatPanel);

    // Set up approval button event handling
    this._setupApprovalHandlers();

    // Set up message processing for approval buttons
    this._setupMessageProcessing();

    // Fix the focus issue: override the global click handler
    // TODO: remove after https://github.com/jupyterlab/jupyter-chat/issues/267
    this._fixCopyFocusIssue();
  }

  /**
   * Creates and configures the toolbar with token usage display and settings button.
   *
   * TODO: integrate with IToolbarRegistry to allow adding custom toolbar items
   *
   * @returns The configured toolbar widget
   */
  private _createToolbar() {
    const toolbar = new Toolbar();
    const tokenUsageWidget = new TokenUsageWidget({
      tokenUsageChanged: this._chatModel.tokenUsageChanged,
      settingsModel: this._settingsModel
    });
    toolbar.addItem('token-usage', tokenUsageWidget);

    toolbar.addItem('spacer', Toolbar.createSpacerItem());
    toolbar.addItem(
      'settings',
      new ToolbarButton({
        icon: settingsIcon,
        onClick: () => {
          this._commands.execute('labai:open-settings');
        },
        tooltip: 'Open AI Settings'
      })
    );
    return toolbar;
  }

  /**
   * Sets up event handlers for existing approval buttons in the chat panel.
   */
  private _setupApprovalHandlers() {
    // This method will be called to add handlers to existing buttons
    // New buttons get handlers added in _processApprovalButtons
    const existingButtons = this._chatPanel.node.querySelectorAll(
      '.jp-ai-approval-btn'
    );
    existingButtons.forEach(button => {
      this._addButtonHandler(button as HTMLButtonElement);
    });
  }

  /**
   * Adds click event handler to an approval button.
   *
   * @param button - The button element to add handler to
   */
  private _addButtonHandler(button: HTMLButtonElement) {
    // Remove any existing listeners to avoid duplicates
    button.removeEventListener('click', this._handleButtonClick);
    button.addEventListener('click', this._handleButtonClick);
  }

  /**
   * Handles click events for individual approval buttons.
   *
   * @param event - The click event
   */
  private _handleButtonClick = async (event: Event) => {
    const target = event.target as HTMLElement;
    event.preventDefault();
    event.stopPropagation();

    const buttonsContainer = target.closest('.jp-ai-tool-approval-buttons');
    if (!buttonsContainer) {
      return;
    }

    const interruptionId = buttonsContainer.getAttribute(
      'data-interruption-id'
    );
    if (!interruptionId) {
      return;
    }

    // Get message ID for updating the tool call box
    const messageId = buttonsContainer.getAttribute('data-message-id');

    // Hide buttons immediately and show status
    const isApprove = target.classList.contains('jp-ai-approval-approve');
    this._showApprovalStatus(buttonsContainer, isApprove);

    if (isApprove) {
      // Execute approval with message ID for updating the tool call box
      await this._chatModel.approveToolCall(
        interruptionId,
        messageId || undefined
      );
    } else if (target.classList.contains('jp-ai-approval-reject')) {
      // Execute rejection with message ID for updating the tool call box
      await this._chatModel.rejectToolCall(
        interruptionId,
        messageId || undefined
      );
    }
  };

  /**
   * Adds click event handler to a grouped approval button.
   *
   * @param button - The button element to add handler to
   */
  private _addGroupedButtonHandler(button: HTMLButtonElement) {
    // Remove any existing listeners to avoid duplicates
    button.removeEventListener('click', this._handleGroupedButtonClick);
    button.addEventListener('click', this._handleGroupedButtonClick);
  }

  /**
   * Handles click events for grouped approval buttons.
   *
   * @param event - The click event
   */
  private _handleGroupedButtonClick = async (event: Event) => {
    const target = event.target as HTMLElement;
    event.preventDefault();
    event.stopPropagation();

    const buttonsContainer = target.closest('.jp-ai-group-approval-buttons');
    if (!buttonsContainer) {
      return;
    }

    const groupId = buttonsContainer.getAttribute('data-group-id');
    const interruptionIdsStr = buttonsContainer.getAttribute(
      'data-interruption-ids'
    );
    if (!groupId || !interruptionIdsStr) {
      return;
    }

    const interruptionIds = interruptionIdsStr.split(',');
    const messageId = buttonsContainer.getAttribute('data-message-id');

    // Hide buttons immediately and show status
    const isApprove = target.classList.contains('jp-ai-group-approve-all');
    this._showGroupApprovalStatus(buttonsContainer, isApprove);

    if (isApprove) {
      // Execute grouped approval
      await this._chatModel.approveGroupedToolCalls(
        groupId,
        interruptionIds,
        messageId || undefined
      );
    } else if (target.classList.contains('jp-ai-group-reject-all')) {
      // Execute grouped rejection
      await this._chatModel.rejectGroupedToolCalls(
        groupId,
        interruptionIds,
        messageId || undefined
      );
    }
  };

  /**
   * Shows approval status by replacing buttons with status indicator.
   *
   * @param buttonsContainer - The container element holding the buttons
   * @param isApprove - Whether the action was approval or rejection
   */
  private _showApprovalStatus(
    buttonsContainer: Element,
    isApprove: boolean
  ): void {
    // Clear the container and add status indicator
    buttonsContainer.innerHTML = '';

    const statusDiv = document.createElement('div');
    statusDiv.className = `jp-ai-approval-status ${isApprove ? 'jp-ai-approval-status-approved' : 'jp-ai-approval-status-rejected'}`;

    const icon = document.createElement('span');
    icon.className = 'jp-ai-approval-icon';
    icon.textContent = isApprove ? '✅' : '❌';

    const text = document.createElement('span');
    text.textContent = isApprove ? 'Tools approved' : 'Tools rejected';

    statusDiv.appendChild(icon);
    statusDiv.appendChild(text);
    buttonsContainer.appendChild(statusDiv);
  }

  /**
   * Shows group approval status by replacing buttons with status indicator.
   *
   * @param buttonsContainer - The container element holding the buttons
   * @param isApprove - Whether the action was approval or rejection
   * @param toolCount - The number of tools that were approved/rejected
   */
  private _showGroupApprovalStatus(
    buttonsContainer: Element,
    isApprove: boolean
  ): void {
    // Clear the container and add status indicator
    buttonsContainer.innerHTML = '';

    const statusDiv = document.createElement('div');
    statusDiv.className = `jp-ai-group-approval-status ${isApprove ? 'jp-ai-group-approval-status-approved' : 'jp-ai-group-approval-status-rejected'}`;

    const icon = document.createElement('span');
    icon.className = 'jp-ai-approval-icon';
    icon.textContent = isApprove ? '✅' : '❌';

    const text = document.createElement('span');
    text.textContent = isApprove ? 'Tools approved' : 'Tools rejected';

    statusDiv.appendChild(icon);
    statusDiv.appendChild(text);
    buttonsContainer.appendChild(statusDiv);
  }

  /**
   * Sets up mutation observer to watch for new messages and process approval buttons.
   */
  private _setupMessageProcessing() {
    // Use a MutationObserver to watch for new messages and process approval buttons
    const observer = new MutationObserver(mutations => {
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node as Element;
            this._processApprovalButtons(element);
          }
        });
      });
    });

    observer.observe(this._chatPanel.node, {
      childList: true,
      subtree: true
    });
  }

  /**
   * Processes text nodes to replace approval button placeholders with actual button elements.
   *
   * @param element - The element to search for approval button placeholders
   */
  private _processApprovalButtons(element: Element) {
    // Find all text nodes that contain approval buttons and replace them with actual buttons
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      null
    );

    const textNodes: Text[] = [];
    let node;
    while ((node = walker.nextNode())) {
      textNodes.push(node as Text);
    }

    textNodes.forEach(textNode => {
      const text = textNode.textContent || '';

      // Handle single tool approval buttons [APPROVAL_BUTTONS:id]
      const singleMatch = text.match(/\[APPROVAL_BUTTONS:([^\]]+)\]/);
      if (singleMatch) {
        this._createSingleApprovalButtons(textNode, singleMatch[1]);
        return;
      }

      // Handle grouped tool approval buttons [GROUP_APPROVAL_BUTTONS:groupId:id1,id2,id3]
      const groupMatch = text.match(
        /\[GROUP_APPROVAL_BUTTONS:([^:]+):([^\]]+)\]/
      );
      if (groupMatch) {
        this._createGroupedApprovalButtons(
          textNode,
          groupMatch[1],
          groupMatch[2]
        );
        return;
      }
    });
  }

  /**
   * Creates an approval button element with appropriate styling and classes.
   *
   * @param text - The button text
   * @param isApprove - Whether this is an approve or reject button
   * @param additionalClasses - Additional CSS classes to add
   * @returns The created button element
   */
  private _createApprovalButton(
    text: string,
    isApprove: boolean,
    additionalClasses: string = ''
  ): HTMLButtonElement {
    const button = document.createElement('button');
    const baseClass = isApprove
      ? 'jp-ai-approval-approve'
      : 'jp-ai-approval-reject';
    button.className = `jp-ai-approval-btn ${baseClass}${additionalClasses ? ' ' + additionalClasses : ''}`;
    button.textContent = text;
    return button;
  }

  /**
   * Creates and inserts approval buttons for a single tool call.
   *
   * @param textNode - The text node to replace with buttons
   * @param interruptionId - The interruption ID for the tool call
   */
  private _createSingleApprovalButtons(textNode: Text, interruptionId: string) {
    // Create approval buttons for single tool
    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'jp-ai-tool-approval-buttons';
    buttonContainer.setAttribute('data-interruption-id', interruptionId);

    // Try to find the message ID from the closest message container
    const messageId = this._findMessageId(textNode);
    if (messageId) {
      buttonContainer.setAttribute('data-message-id', messageId);
    }

    const approveBtn = this._createApprovalButton('Approve', true);
    const rejectBtn = this._createApprovalButton('Reject', false);

    // Add click handlers directly to the buttons
    this._addButtonHandler(approveBtn);
    this._addButtonHandler(rejectBtn);

    buttonContainer.appendChild(approveBtn);
    buttonContainer.appendChild(rejectBtn);

    // Replace the text node with the button container
    const parent = textNode.parentNode;
    if (parent) {
      parent.replaceChild(buttonContainer, textNode);
    }
  }

  /**
   * Creates and inserts approval buttons for grouped tool calls.
   *
   * @param textNode - The text node to replace with buttons
   * @param groupId - The group ID for the tool calls
   * @param interruptionIds - Comma-separated interruption IDs
   */
  private _createGroupedApprovalButtons(
    textNode: Text,
    groupId: string,
    interruptionIds: string
  ) {
    // Create approval buttons for grouped tools
    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'jp-ai-group-approval-buttons';
    buttonContainer.setAttribute('data-group-id', groupId);
    buttonContainer.setAttribute('data-interruption-ids', interruptionIds);

    // Try to find the message ID from the closest message container
    const messageId = this._findMessageId(textNode);
    if (messageId) {
      buttonContainer.setAttribute('data-message-id', messageId);
    }

    const approveBtn = this._createApprovalButton(
      'Approve',
      true,
      'jp-ai-group-approve-all'
    );
    const rejectBtn = this._createApprovalButton(
      'Reject',
      false,
      'jp-ai-group-reject-all'
    );

    // Add click handlers for grouped approvals
    this._addGroupedButtonHandler(approveBtn);
    this._addGroupedButtonHandler(rejectBtn);

    buttonContainer.appendChild(approveBtn);
    buttonContainer.appendChild(rejectBtn);

    // Replace the text node with the button container
    const parent = textNode.parentNode;
    if (parent) {
      parent.replaceChild(buttonContainer, textNode);
    }
  }

  /**
   * Finds the message ID by traversing up the DOM tree from a text node.
   *
   * @param textNode - The text node to start searching from
   * @returns The message ID if found, null otherwise
   */
  private _findMessageId(textNode: Text): string | null {
    let messageElement = textNode.parentNode;
    while (messageElement && messageElement !== document.body) {
      if (messageElement.nodeType === Node.ELEMENT_NODE) {
        const element = messageElement as Element;
        // Look for common message container attributes or classes
        const messageId =
          element.getAttribute('data-message-id') ||
          element.getAttribute('id') ||
          element
            .querySelector('[data-message-id]')
            ?.getAttribute('data-message-id');
        if (messageId) {
          return messageId;
        }
      }
      messageElement = messageElement.parentNode;
    }
    return null;
  }

  /**
   * Fixes focus issue by replacing the global click handler with a more selective one.
   * Only focuses the input when clicking empty areas, not on interactive elements.
   */
  private _fixCopyFocusIssue() {
    // Remove the global click handler that causes focus on any click
    // The original handler is: this.node.onclick = () => this.model.input.focus();
    if (this._chatPanel.node.onclick) {
      this._chatPanel.node.onclick = null;
    }

    // Add a more selective click handler that only focuses when clicking empty areas
    this._chatPanel.node.addEventListener('click', (event: Event) => {
      const target = event.target as HTMLElement;

      // Don't focus if clicking on selectable text elements
      const selection = window.getSelection();
      if (
        target.closest('pre') ||
        target.closest('code') ||
        target.closest('.jp-RenderedMarkdown') ||
        target.closest('.jp-ai-tool-call') ||
        target.closest('button') ||
        target.closest('.jp-chat-input-container') ||
        (selection && selection.toString().length > 0)
      ) {
        return;
      }

      // Only focus input when clicking empty chat areas
      this._chatModel.input.focus();
    });
  }

  // Private fields
  private _chatPanel: Widget;
  private _chatModel: AIChatModel;
  private _settingsModel: AISettingsModel;
  private _toolbar: Toolbar;
  private _commands: CommandRegistry;
}

/**
 * Namespace for ChatWrapperWidget statics.
 */
export namespace ChatWrapperWidget {
  /**
   * The options for the constructor of the chat wrapper widget.
   */
  export interface IOptions {
    /**
     * The chat panel widget to wrap.
     */
    chatPanel: Widget;
    /**
     * The command registry for the chat wrapper.
     */
    commands: CommandRegistry;
    /**
     * The chat model for the chat wrapper.
     */
    chatModel: AIChatModel;
    /**
     * The settings model for the chat wrapper.
     */
    settingsModel: AISettingsModel;
  }
}
