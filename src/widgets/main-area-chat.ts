import { ChatWidget, IChatModel, MultiChatPanel } from '@jupyter/chat';
import { CommandToolbarButton, MainAreaWidget } from '@jupyterlab/apputils';
import { launchIcon } from '@jupyterlab/ui-components';
import type { TranslationBundle } from '@jupyterlab/translation';
import { CommandRegistry } from '@lumino/commands';

import { RenderedMessageOutputAreaCompat } from '../rendered-message-outputarea';
import { CommandIds, IAIChatModel, type IAISettingsModel } from '../tokens';

export namespace MainAreaChat {
  export interface IOptions extends MainAreaWidget.IOptions<ChatWidget> {
    commands: CommandRegistry;
    settingsModel: IAISettingsModel;
    trans: TranslationBundle;
    chatToolbarItems?: MultiChatPanel.IChatToolbarItem[];
  }
}

/**
 * The chat as a main area widget.
 */
export class MainAreaChat extends MainAreaWidget<ChatWidget> {
  constructor(options: MainAreaChat.IOptions) {
    super(options);
    this.title.label = this.model.name;
    this.title.caption = this.model.title ?? this.model.name;

    // Move to side button.
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

    if (options.chatToolbarItems) {
      for (const item of options.chatToolbarItems) {
        this.toolbar.addItem(item.name, item.create(this.content));
      }
    }

    // Temporary compat: keep output-area CSS context for MIME renderers
    // until jupyter-chat provides it natively.
    this._outputAreaCompat = new RenderedMessageOutputAreaCompat({
      chatPanel: this.content
    });

    this.model.writersChanged?.connect(this._writersChanged);

    this.model.titleChanged.connect(this._titleChanged);
  }

  dispose(): void {
    super.dispose();
    // Dispose of the approval buttons widget when the chat is disposed.
    this._outputAreaCompat.dispose();
    this.model.writersChanged?.disconnect(this._writersChanged);
    this.model.titleChanged.disconnect(this._titleChanged);
  }

  /**
   * Get the model of the chat.
   */
  get model(): IAIChatModel {
    return this.content.model as IAIChatModel;
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
      this.content.inputToolbarRegistry?.show('stop');
    } else {
      this.content.inputToolbarRegistry?.hide('stop');
    }
  };

  private _titleChanged = () => {
    this.title.caption = this.model.title ?? this.model.name;
  };

  private _outputAreaCompat: RenderedMessageOutputAreaCompat;
}
