import { ChatWidget } from '@jupyter/chat';
import { IDisposable } from '@lumino/disposable';
import type { AgentManager } from './agent';

/**
 * Handles click events for approval buttons in the chat panel.
 */
export class ApprovalButtons implements IDisposable {
  constructor(options: ApprovalButtons.IOptions) {
    this._chatPanel = options.chatPanel;
    this._agentManager = options.agentManager;

    this._chatPanel.node.addEventListener('click', this._handleClick);
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

    this._chatPanel.node.removeEventListener('click', this._handleClick);
    this._chatPanel = null!;
  }

  /**
   * Handles click events using event delegation.
   * Detects clicks on approval buttons and calls the appropriate handler.
   */
  private _handleClick = (event: Event): void => {
    const target = event.target as HTMLElement;

    // Check if the click target is an approval button
    if (!target.classList.contains('jp-ai-approval-btn')) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const isApprove = target.classList.contains('jp-ai-approval-approve');
    this._handleApproval(target, isApprove);
  };

  /**
   * Handles approval/rejection of a tool call.
   */
  private _handleApproval(target: HTMLElement, isApprove: boolean): void {
    const container = target.closest('.jp-ai-tool-approval-buttons');
    if (!container) {
      return;
    }

    // Extract approval ID from class name (encoded as jp-ai-approval-id--{id})
    const approvalId = this._extractApprovalId(container);
    if (!approvalId) {
      console.warn('No approval ID found for button');
      return;
    }

    // Disable buttons to prevent double-clicks
    const buttons = container.querySelectorAll('button');
    buttons.forEach(btn => btn.setAttribute('disabled', 'true'));

    if (isApprove) {
      this._agentManager.approveToolCall(approvalId);
    } else {
      this._agentManager.rejectToolCall(approvalId);
    }
  }

  /**
   * Extracts the approval ID from an element's class list.
   * The ID is encoded in a class name like "jp-ai-approval-id--{id}".
   */
  private _extractApprovalId(element: Element): string | null {
    const prefix = 'jp-ai-approval-id--';
    for (const className of element.classList) {
      if (className.startsWith(prefix)) {
        return className.slice(prefix.length);
      }
    }
    return null;
  }

  private _chatPanel: ChatWidget;
  private _isDisposed: boolean = false;
  private _agentManager: AgentManager;
}

/**
 * Namespace for ApprovalButtons statics.
 */
export namespace ApprovalButtons {
  /**
   * The options for the constructor of the approval buttons.
   */
  export interface IOptions {
    /**
     * The chat panel widget to wrap.
     */
    chatPanel: ChatWidget;
    /**
     * The agent manager for handling approvals.
     */
    agentManager: AgentManager;
  }
}
