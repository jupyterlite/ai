import { ChatWidget, IChatModel } from '@jupyter/chat';
import { CommandToolbarButton, MainAreaWidget } from '@jupyterlab/apputils';
import { launchIcon } from '@jupyterlab/ui-components';
import type { TranslationBundle } from '@jupyterlab/translation';
import { CommandRegistry } from '@lumino/commands';

import { ApprovalButtons } from '../approval-buttons';
import { AIChatModel } from '../chat-model';
import { TokenUsageWidget } from '../components/token-usage-display';
import { AISettingsModel } from '../models/settings-model';
import { RenderedMessageOutputAreaCompat } from '../rendered-message-outputarea';
import { CommandIds } from '../tokens';

export namespace MainAreaChat {
  export interface IOptions extends MainAreaWidget.IOptions<ChatWidget> {
    commands: CommandRegistry;
    settingsModel: AISettingsModel;
    trans: TranslationBundle;
  }
}

/**
 * The chat as a main area widget.
 */
export class MainAreaChat extends MainAreaWidget<ChatWidget> {
  constructor(options: MainAreaChat.IOptions) {
    super(options);
    this.title.label = this.content.model.name;

    const { trans } = options;

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
      initialTokenUsage: this.model.agentManager.tokenUsage,
      translator: trans
    });
    this.toolbar.addItem('token-usage', tokenUsageWidget);

    // Add the approval button, tied to the chat widget.
    this._approvalButtons = new ApprovalButtons({
      chatPanel: this.content,
      agentManager: this.model.agentManager
    });
    // Temporary compat: keep output-area CSS context for MIME renderers
    // until jupyter-chat provides it natively.
    this._outputAreaCompat = new RenderedMessageOutputAreaCompat({
      chatPanel: this.content
    });

    this.model.writersChanged.connect(this._writersChanged);
  }

  dispose(): void {
    super.dispose();
    // Dispose of the approval buttons widget when the chat is disposed.
    this._approvalButtons.dispose();
    this._outputAreaCompat.dispose();
    this.model.writersChanged.disconnect(this._writersChanged);
  }

  /**
   * Get the model of the chat.
   */
  get model(): AIChatModel {
    return this.content.model as AIChatModel;
  }

  /**
   * Get the area of the chat.
   */
  get area(): string | undefined {
    return this.content.area;
  }

  private _writersChanged = (_: IChatModel, writers: IChatModel.IWriter[]) => {
    // Check if AI is currently writing (streaming)
    const aiWriting = writers.some(
      writer => writer.user.username === 'ai-assistant'
    );

    if (aiWriting) {
      this.content.inputToolbarRegistry?.hide('send');
      this.content.inputToolbarRegistry?.show('stop');
    } else {
      this.content.inputToolbarRegistry?.hide('stop');
      this.content.inputToolbarRegistry?.show('send');
    }
  };

  private _approvalButtons: ApprovalButtons;
  private _outputAreaCompat: RenderedMessageOutputAreaCompat;
}
