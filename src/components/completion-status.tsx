import React, { useEffect, useState } from 'react';
import { AISettingsModel } from '../models/settings-model';
import { ReactWidget } from '@jupyterlab/ui-components';
import type { TranslationBundle } from '@jupyterlab/translation';
import { jupyternautIcon } from '../icons';

const COMPLETION_STATUS_CLASS = 'jp-ai-completion-status';
const COMPLETION_DISABLED_CLASS = 'jp-ai-completion-disabled';

/**
 * The completion status props.
 */
interface ICompletionStatusProps {
  /**
   * The settings model.
   */
  settingsModel: AISettingsModel;
  /**
   * The application language translator.
   */
  translator: TranslationBundle;
}

/**
 * The completion status component.
 */
function CompletionStatus(props: ICompletionStatusProps): JSX.Element {
  const { translator: trans } = props;
  const [disabled, setDisabled] = useState<boolean>(true);
  const [title, setTitle] = useState<string>('');

  /**
   * Handle changes in the settings.
   */
  useEffect(() => {
    const stateChanged = (model: AISettingsModel) => {
      if (model.config.useSameProviderForChatAndCompleter) {
        setDisabled(false);
        setTitle(
          trans.__(
            'Completion using %1',
            model.getDefaultProvider()?.model ?? ''
          )
        );
      } else if (model.config.activeCompleterProvider) {
        setDisabled(false);
        setTitle(
          trans.__(
            'Completion using %1',
            model.getProvider(model.config.activeCompleterProvider)?.model ?? ''
          )
        );
      } else {
        setDisabled(true);
        setTitle(trans.__('No completion'));
      }
    };

    props.settingsModel.stateChanged.connect(stateChanged);

    stateChanged(props.settingsModel);
    return () => {
      props.settingsModel.stateChanged.disconnect(stateChanged);
    };
  }, [props.settingsModel, trans]);

  return (
    <jupyternautIcon.react
      className={disabled ? COMPLETION_DISABLED_CLASS : ''}
      top={'2px'}
      width={'16px'}
      stylesheet={'statusBar'}
      title={title}
    />
  );
}

/**
 * The completion status widget that will be added to the status bar.
 */
export class CompletionStatusWidget extends ReactWidget {
  constructor(options: ICompletionStatusProps) {
    super();
    this.addClass(COMPLETION_STATUS_CLASS);
    this._props = options;
  }

  render(): JSX.Element {
    return <CompletionStatus {...this._props} />;
  }

  private _props: ICompletionStatusProps;
}
