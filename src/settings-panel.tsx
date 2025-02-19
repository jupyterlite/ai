import { ISettingRegistry } from '@jupyterlab/settingregistry';
import { FormComponent, IFormRenderer } from '@jupyterlab/ui-components';
import { JSONExt } from '@lumino/coreutils';
import { IChangeEvent } from '@rjsf/core';
import type { FieldProps } from '@rjsf/utils';
import validator from '@rjsf/validator-ajv8';
import { JSONSchema7 } from 'json-schema';
import React from 'react';

import BaseSchema from './base-settings.json';
import { getSettings } from './llm-models';

export const aiSettingsRenderer: IFormRenderer = {
  fieldRenderer: (props: FieldProps) => <AiSettings {...props} />
};

export interface IDict<T = any> {
  [key: string]: T;
}

export interface ISettingsFormStates {
  schema: JSONSchema7;
}

const WrappedFormComponent = (props: any): JSX.Element => {
  return <FormComponent {...props} validator={validator} />;
};

export class AiSettings extends React.Component<
  FieldProps,
  ISettingsFormStates
> {
  constructor(props: FieldProps) {
    super(props);
    this._settingsRegistry = props.formContext.settings;
    this.state = {
      schema: JSONExt.deepCopy(BaseSchema) as JSONSchema7
    };
    this.currentSettings = { provider: 'None' };
  }

  private _updateSchema(provider: string) {
    const newSchema = JSONExt.deepCopy(BaseSchema) as any;
    const settingsSchema = getSettings(provider);
    if (settingsSchema) {
      Object.entries(settingsSchema).forEach(([key, value]) => {
        newSchema.properties[key] = value;
      });
    }
    this.setState({ schema: newSchema as JSONSchema7 });
  }

  private _onFormChange = (e: IChangeEvent) => {
    const provider = e.formData.provider;
    if (provider !== this.currentSettings.provider) {
      this._settingsRecords.set(
        this.currentSettings.provider,
        JSONExt.deepCopy(this.currentSettings)
      );
      this.currentSettings = this._settingsRecords.get(provider) ?? {
        provider
      };
      this._updateSchema(e.formData.provider);
    } else {
      this.currentSettings = JSONExt.deepCopy(e.formData);
    }
    this._settingsRegistry
      .set('provider', this.currentSettings)
      .catch(console.error);
  };

  render(): JSX.Element {
    return (
      <WrappedFormComponent
        formData={this.currentSettings}
        schema={this.state.schema}
        onChange={this._onFormChange}
      />
    );
  }

  protected currentSettings: IDict<any> = { provider: 'None' };
  private _settingsRecords = new Map<string, IDict<any>>();
  private _settingsRegistry: ISettingRegistry.ISettings;
}
