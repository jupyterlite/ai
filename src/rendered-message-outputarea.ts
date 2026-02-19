import { ChatWidget } from '@jupyter/chat';
import { IDisposable } from '@lumino/disposable';

const OUTPUT_AREA_CLASS = 'jp-OutputArea';
const CHAT_RENDERED_MESSAGE_SELECTOR = `.jp-chat-rendered-message:not(.${OUTPUT_AREA_CLASS})`;

/**
 * Ensures chat-rendered MIME outputs also expose the OutputArea class so
 * renderer extensions can reuse their notebook/output-area CSS rules.
 *
 * TODO: Remove this compatibility layer once jupyter-chat applies
 * `jp-OutputArea` (or equivalent output-area context) to rendered MIME
 * messages by default.
 */
export class RenderedMessageOutputAreaCompat implements IDisposable {
  constructor(options: RenderedMessageOutputAreaCompat.IOptions) {
    this._chatPanel = options.chatPanel;
    this._chatPanel.model.messagesUpdated.connect(this._scheduleSync, this);
    this._scheduleSync();
  }

  get isDisposed(): boolean {
    return this._isDisposed;
  }

  dispose(): void {
    if (this._isDisposed) {
      return;
    }
    this._isDisposed = true;
    this._chatPanel.model.messagesUpdated.disconnect(this._scheduleSync, this);
    if (this._raf !== 0) {
      cancelAnimationFrame(this._raf);
      this._raf = 0;
    }
  }

  private _scheduleSync(): void {
    if (this._isDisposed || this._raf !== 0) {
      return;
    }
    this._raf = requestAnimationFrame(() => {
      this._raf = 0;
      if (this._isDisposed) {
        return;
      }
      this._chatPanel.node
        .querySelectorAll<HTMLElement>(CHAT_RENDERED_MESSAGE_SELECTOR)
        .forEach(element => element.classList.add(OUTPUT_AREA_CLASS));
    });
  }

  private readonly _chatPanel: ChatWidget;
  private _isDisposed = false;
  private _raf = 0;
}

export namespace RenderedMessageOutputAreaCompat {
  export interface IOptions {
    chatPanel: ChatWidget;
  }
}
