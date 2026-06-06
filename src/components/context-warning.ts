import type { TranslationBundle } from '@jupyterlab/translation';
import { closeIcon } from '@jupyterlab/ui-components';
import type { ISignal } from '@lumino/signaling';

import type { IAISettingsModel, ITokenUsage } from '../tokens';

const WARNING_THRESHOLD = 95;
const INPUT_CONTAINER_CLASS = 'jp-chat-input-container';
const WARNING_CLASS = 'jp-ai-ContextWarning';
const WARNING_MESSAGE_CLASS = 'jp-ai-ContextWarning-message';
const WARNING_CLOSE_CLASS = 'jp-ai-ContextWarning-close';

/**
 * Displays a context usage warning above the chat input.
 */
export class ContextWarningController {
  constructor(options: ContextWarningController.IOptions) {
    this._host = options.host;
    this._tokenUsageChanged = options.tokenUsageChanged;
    this._settingsModel = options.settingsModel;
    this._trans = options.translator;
    this._tokenUsage = options.initialTokenUsage;
    this._threshold = options.threshold ?? WARNING_THRESHOLD;

    this._node = document.createElement('div');
    this._node.className = WARNING_CLASS;
    this._node.hidden = true;
    this._node.setAttribute('role', 'status');

    this._messageNode = document.createElement('span');
    this._messageNode.className = WARNING_MESSAGE_CLASS;
    this._node.appendChild(this._messageNode);

    this._closeButton = document.createElement('button');
    this._closeButton.type = 'button';
    this._closeButton.className = WARNING_CLOSE_CLASS;
    this._closeButton.title = this._trans.__('Dismiss context warning');
    this._closeButton.setAttribute(
      'aria-label',
      this._trans.__('Dismiss context warning')
    );
    this._closeButton.appendChild(
      closeIcon.element({
        elementPosition: 'center',
        height: '16px',
        tag: 'span',
        width: '16px'
      })
    );
    this._closeButton.addEventListener('click', this._dismiss);
    this._node.appendChild(this._closeButton);

    this._tokenUsageChanged.connect(this._onTokenUsageChanged, this);
    this._settingsModel.stateChanged.connect(this._onSettingsChanged, this);

    this._observer = new MutationObserver(this._attach);
    this._observer.observe(this._host, { childList: true, subtree: true });

    this._attach();
    this._update();
  }

  dispose(): void {
    this._observer.disconnect();
    this._tokenUsageChanged.disconnect(this._onTokenUsageChanged, this);
    this._settingsModel.stateChanged.disconnect(this._onSettingsChanged, this);
    this._closeButton.removeEventListener('click', this._dismiss);
    this._node.remove();
  }

  private _attach = (): void => {
    const input = this._host.querySelector(`.${INPUT_CONTAINER_CLASS}`);
    if (
      !input?.parentElement ||
      this._node.parentElement === input.parentElement
    ) {
      return;
    }
    input.parentElement.insertBefore(this._node, input);
  };

  private _onTokenUsageChanged = (
    _: unknown,
    tokenUsage: ITokenUsage
  ): void => {
    this._tokenUsage = tokenUsage;
    this._update();
  };

  private _onSettingsChanged = (): void => {
    this._update();
  };

  private _dismiss = (): void => {
    this._dismissedWarningKey = this._warningKey;
    this._node.hidden = true;
  };

  private _update(): void {
    const contextWindow = this._tokenUsage?.contextWindow;
    const inputTokens = this._tokenUsage?.lastRequestInputTokens;
    if (
      inputTokens === undefined ||
      contextWindow === undefined ||
      contextWindow <= 0
    ) {
      this._node.hidden = true;
      return;
    }

    const percent = (inputTokens / contextWindow) * 100;
    if (percent < this._threshold) {
      this._node.hidden = true;
      return;
    }

    const warningKey = `${inputTokens}:${contextWindow}`;
    this._warningKey = warningKey;
    if (warningKey === this._dismissedWarningKey) {
      this._node.hidden = true;
      return;
    }

    const roundedPercent = Math.round(percent).toLocaleString();
    const message = this._trans.__(
      'Context warning: last request used %1% of the context window (%2 / %3 tokens).',
      roundedPercent,
      inputTokens.toLocaleString(),
      contextWindow.toLocaleString()
    );

    this._messageNode.textContent = message;
    this._node.title = message;
    this._node.hidden = false;
    this._attach();
  }

  private _host: HTMLElement;
  private _node: HTMLDivElement;
  private _messageNode: HTMLSpanElement;
  private _closeButton: HTMLButtonElement;
  private _observer: MutationObserver;
  private _tokenUsage: ITokenUsage | undefined;
  private _threshold: number;
  private _warningKey: string | undefined;
  private _dismissedWarningKey: string | undefined;
  private _tokenUsageChanged: ISignal<unknown, ITokenUsage>;
  private _settingsModel: IAISettingsModel;
  private _trans: TranslationBundle;
}

export namespace ContextWarningController {
  export interface IOptions {
    /**
     * The chat widget host node.
     */
    host: HTMLElement;
    /**
     * The token usage changed signal.
     */
    tokenUsageChanged: ISignal<unknown, ITokenUsage>;
    /**
     * The settings model.
     */
    settingsModel: IAISettingsModel;
    /**
     * Initial token usage.
     */
    initialTokenUsage?: ITokenUsage;
    /**
     * The application language translator.
     */
    translator: TranslationBundle;
    /**
     * Warning threshold as a percentage.
     */
    threshold?: number;
  }
}
