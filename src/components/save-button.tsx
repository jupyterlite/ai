import {
  historyIcon,
  ReactWidget,
  saveIcon,
  ToolbarButtonComponent
} from '@jupyterlab/ui-components';
import type { TranslationBundle } from '@jupyterlab/translation';
import React, { useCallback, useEffect, useRef, useState } from 'react';

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
 * A split button for saving the chat, with a dropdown to toggle auto-save.
 * When auto-save is active, the save button displays the JupyterLab
 * toggled-on appearance (inset box-shadow all around).
 */
export function SaveComponent(props: ISaveButtonProps): JSX.Element {
  const { model, translator: trans } = props;

  const [autoSave, setAutoSave] = useState(model.autoSave);
  const autoSaveRef = useRef(autoSave);

  // Keep ref in sync with state so the signal handler always sees the latest
  // value without needing to reconnect on every toggle.
  useEffect(() => {
    autoSaveRef.current = autoSave;
  }, [autoSave]);

  const handleSave = useCallback(() => {
    model.save();
  }, [model]);

  const toggleAutoSave = useCallback(() => {
    setAutoSave(prev => {
      model.autoSave = !prev;
      return !prev;
    });
  }, []);

  return (
    <div className={`${COMPONENT_CLASS}${autoSave ? ' lm-mod-toggled' : ''}`}>
      <ToolbarButtonComponent
        icon={saveIcon}
        onClick={handleSave}
        tooltip={trans.__('Save chat')}
      />
      <ToolbarButtonComponent
        className={AUTOSAVE_BUTTON_CLASS}
        icon={historyIcon}
        onClick={toggleAutoSave}
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
