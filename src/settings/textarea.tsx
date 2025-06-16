import { ISettingRegistry } from '@jupyterlab/settingregistry';
import { IFormRenderer } from '@jupyterlab/ui-components';
import { FieldProps } from '@rjsf/utils';
import React, { useState } from 'react';

const TEXTAREA_CLASS = 'jp-AISettingsTextArea';

export const textArea: IFormRenderer = {
  fieldRenderer: (props: FieldProps) => {
    const settings: ISettingRegistry.ISettings = props.formContext.settings;
    const schema = settings.schema.properties?.[props.name];
    const [formData, setFormData] = useState<string>(props.formData);
    settings.changed.connect(() => {
      setFormData(settings.get(props.name).composite as string);
    });
    const onChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      settings.set(props.name, event.target.value);
    };

    return (
      <>
        {schema?.title && (
          <h3 className="jp-FormGroup-fieldLabel jp-FormGroup-contentItem">
            {schema.title}
          </h3>
        )}
        <textarea className={TEXTAREA_CLASS} onChange={onChange}>
          {formData}
        </textarea>
      </>
    );
  }
};
