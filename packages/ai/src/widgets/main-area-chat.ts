import { ChatArea, ChatWidget, IChatModel, IChatPanel } from '@jupyter/chat';
import { MainAreaWidget } from '@jupyterlab/apputils';

import { RenderedMessageOutputAreaCompat } from '../rendered-message-outputarea';
import { ChatToolbarFactory, IAIChatModel } from '../tokens';

export namespace MainAreaChat {
  export interface IOptions extends MainAreaWidget.IOptions<ChatWidget> {
    /**
     * An optional toolbar factory.
     */
    toolbarFactory?: ChatToolbarFactory;
  }
}

/**
 * The chat as a main area widget.
 */
export class MainAreaChat
  extends MainAreaWidget<ChatWidget>
  implements IChatPanel
{
  constructor(options: MainAreaChat.IOptions) {
    super(options);
    this.title.label = this.model.name;
    this.title.caption = this.model.title ?? this.model.name;

    if (options.toolbarFactory) {
      const items = options.toolbarFactory(this);
      for (let i = 0; i < items.length; i++) {
        const { name, widget } = items.get(i);
        this.toolbar.addItem(name, widget);
      }
      items.changed.connect((_, change) => {
        if (change.type === 'add') {
          for (const { name, widget } of change.newValues) {
            this.toolbar.addItem(name, widget);
          }
        } else if (change.type === 'remove') {
          for (const { widget } of change.oldValues) {
            widget.dispose();
          }
        }
      });
    }

    // Temporary compat: keep output-area CSS context for MIME renderers
    // until jupyter-chat provides it natively.
    this._outputAreaCompat = new RenderedMessageOutputAreaCompat({
      chatPanel: this
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
   * Get the chat widget
   */
  get widget(): ChatWidget {
    return this.content;
  }

  /**
   * Get the area of the chat.
   */
  get area(): ChatArea {
    return 'main';
  }

  private _writersChanged = (_: IChatModel, writers: IChatModel.IWriter[]) => {
    // Check if AI is currently writing (streaming)
    const aiWriting = writers.some(writer => writer.user.bot);

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
