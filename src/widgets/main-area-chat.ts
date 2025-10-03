import { ChatWidget } from '@jupyter/chat';
import { CommandToolbarButton, MainAreaWidget } from '@jupyterlab/apputils';
import { launchIcon } from '@jupyterlab/ui-components';
import { CommandRegistry } from '@lumino/commands';

import { ApprovalButtons } from '../approval-buttons';
import { AIChatModel } from '../chat-model';
import { TokenUsageWidget } from '../components/token-usage-display';
import { AISettingsModel } from '../models/settings-model';
import { CommandIds } from '../tokens';

export namespace MainAreaChat {
  export interface IOptions extends MainAreaWidget.IOptions<ChatWidget> {
    commands: CommandRegistry;
    settingsModel: AISettingsModel;
  }
}

/**
 * The chat as a main area widget.
 */
export class MainAreaChat extends MainAreaWidget<ChatWidget> {
  constructor(options: MainAreaChat.IOptions) {
    super(options);
    this.title.label = this.content.model.name;

    // add the move to side button.
    this.toolbar.addItem(
      'moveToSide',
      new CommandToolbarButton({
        commands: options.commands,
        id: CommandIds.moveChat,
        args: {
          name: this.content.model.name,
          area: 'side'
        },
        icon: launchIcon
      })
    );

    // Add the token usage button.
    const tokenUsageWidget = new TokenUsageWidget({
      tokenUsageChanged: this.model.tokenUsageChanged,
      settingsModel: options.settingsModel,
      initialTokenUsage: this.model.agentManager.tokenUsage
    });
    this.toolbar.addItem('token-usage', tokenUsageWidget);

    // Add the approval button, tied to the chat widget.
    this._approvalButtons = new ApprovalButtons({
      chatPanel: this.content
    });
  }

  dispose(): void {
    super.dispose();
    // Dispose of the approval buttons widget when the chat is disposed.
    this._approvalButtons.dispose();
  }

  /**
   * Get the model of the chat.
   */
  get model(): AIChatModel {
    return this.content.model as AIChatModel;
  }

  private _approvalButtons: ApprovalButtons;
}
