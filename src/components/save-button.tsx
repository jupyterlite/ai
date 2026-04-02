import {
  historyIcon,
  ReactWidget,
  saveIcon,
  ToolbarButtonComponent
} from '@jupyterlab/ui-components';
import type { TranslationBundle } from '@jupyterlab/translation';
import React, { useEffect, useState } from 'react';

import { AIChatModel } from '../chat-model';

const COMPONENT_CLASS = 'jp-ai-SaveButton';
const AUTOSAVE_BUTTON_CLASS = 'jp-ai-AutoSaveButton';

/**
 * Properties for the SaveButton component.
 */
export interface ISaveButtonProps {
  /**
   * The chat model, used to listen for message changes for auto-save.
   */
  model: AIChatModel;
  /**
   * The application language translator.
   */
  translator: TranslationBundle;
}

/**
 * A split button for saving the chat, with a button to toggle auto-save.
 * When auto-save is active, the save button displays the JupyterLab
 * toggled-on appearance (inset box-shadow all around).
 */
export function SaveComponent(props: ISaveButtonProps): JSX.Element {
  const { model, translator: trans } = props;

  const [autosave, setAutosave] = useState(model.autosave);

  /**
   * Effect that update the autosave state when it is updated on the model.
   */
  useEffect(() => {
    model.autosaveChanged.connect((_, value) => setAutosave(value));
    return () => {
      model.autosaveChanged.disconnect((_, value) => setAutosave(value));
    };
  }, [model]);

  return (
    <div className={`${COMPONENT_CLASS}${autosave ? ' lm-mod-toggled' : ''}`}>
      <ToolbarButtonComponent
        icon={saveIcon}
        onClick={() => model.save()}
        tooltip={trans.__('Save chat')}
      />
      <ToolbarButtonComponent
        className={AUTOSAVE_BUTTON_CLASS}
        icon={historyIcon}
        onClick={() => (model.autosave = !model.autosave)}
        tooltip={trans.__('Auto-save')}
      />
    </div>
  );
}

/**
 * A Lumino widget wrapping the SaveButton React component.
 */
export class SaveComponentWidget extends ReactWidget {
  constructor(options: ISaveButtonProps) {
    super();
    this._options = options;
  }

  protected render(): React.ReactElement {
    return <SaveComponent {...this._options} />;
  }

  private _options: ISaveButtonProps;
}
