import { ChatWidget } from '@jupyter/chat';
import { IDisposable } from '@lumino/disposable';
import { AIChatModel } from './chat-model';

export class ApprovalButtons implements IDisposable {
  constructor(options: ApprovalButtons.IOptions) {
    this._chatPanel = options.chatPanel;
    this._chatModel = this._chatPanel.model as AIChatModel;

    // Set up approval button event handling
    this._setupApprovalHandlers();

    // Set up message processing for approval buttons
    this._setupMessageProcessing();
  }

  get isDisposed(): boolean {
    return this._isDisposed;
  }

  /**
   * Dispose of the resources held by the object.
   */
  dispose(): void {
    if (this._isDisposed) {
      return;
    }
    this._isDisposed = true;

    // Stop the mutation observer.
    if (this._mutationObserver) {
      this._mutationObserver.disconnect();
      this._mutationObserver = undefined;
    }

    // Remove all listener on existing buttons.
    const existingButtons = this._chatPanel.node.querySelectorAll(
      '.jp-ai-approval-btn'
    );
    existingButtons.forEach(button => {
      button.removeEventListener('click', this._handleButtonClick);
    });

    const existingGroupButtons = this._chatPanel.node.querySelectorAll(
      '.jp-ai-group-approval-buttons button'
    );
    existingGroupButtons.forEach(button => {
      button.removeEventListener('click', this._handleGroupedButtonClick);
    });

    // Clean the references.
    this._chatModel = null!;
    this._chatPanel = null!;
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
    this._mutationObserver = new MutationObserver(mutations => {
      if (this._isDisposed) {
        return;
      }
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node as Element;
            this._processApprovalButtons(element);
          }
        });
      });
    });

    this._mutationObserver.observe(this._chatPanel.node, {
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

  private _chatPanel: ChatWidget;
  private _chatModel: AIChatModel;
  private _isDisposed: boolean = false;
  private _mutationObserver?: MutationObserver;
}

/**
 * Namespace for ChatWrapperWidget statics.
 */
export namespace ApprovalButtons {
  /**
   * The options for the constructor of the chat wrapper widget.
   */
  export interface IOptions {
    /**
     * The chat panel widget to wrap.
     */
    chatPanel: ChatWidget;
  }
}
