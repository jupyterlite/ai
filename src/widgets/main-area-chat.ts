import { ChatWidget } from '@jupyter/chat';
import { CommandToolbarButton, MainAreaWidget } from '@jupyterlab/apputils';
import { launchIcon } from '@jupyterlab/ui-components';
import { CommandRegistry } from '@lumino/commands';

import { AIChatModel } from '../chat-model';
import { CommandIds } from '../tokens';

export namespace MainAreaChat {
  export interface IOptions extends MainAreaWidget.IOptions<ChatWidget> {
    commands: CommandRegistry;
  }
}

/**
 * The chat as a main area widget.
 */
export class MainAreaChat extends MainAreaWidget<ChatWidget> {
  constructor(options: MainAreaChat.IOptions) {
    super(options);
    this.title.label = this.content.model.name;
    console.log('MODEL NAME', this.content.model.name);
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
  }

  get model(): AIChatModel {
    return this.content.model as AIChatModel;
  }
}
