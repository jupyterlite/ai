import { ISettingRegistry } from '@jupyterlab/settingregistry';
import { FormComponent, IFormRenderer } from '@jupyterlab/ui-components';
import { JSONExt } from '@lumino/coreutils';
import { IChangeEvent } from '@rjsf/core';
import type { FieldProps } from '@rjsf/utils';
import validator from '@rjsf/validator-ajv8';

import { JSONSchema7 } from 'json-schema';
import React from 'react';

import baseSettings from './provider-settings/base.json';
import ProviderSettings from './provider-settings';

const STORAGE_NAME = '@jupyterlite/ai:settings';

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
      schema: JSONExt.deepCopy(baseSettings) as JSONSchema7
    };
    this._currentSettings = { provider: 'None' };
  }

  /**
   * Restore settings from local storage for a given provider.
   */
  restoreSettings(provider: string): IDict<any> {
    const settings = JSON.parse(localStorage.getItem(STORAGE_NAME) || '{}');
    return settings[provider] ?? { provider };
  }

  /**
   * Save settings in local storage for a given provider.
   */
  saveSettings(provider: string, value: IDict<any>) {
    const settings = JSON.parse(localStorage.getItem(STORAGE_NAME) ?? '{}');
    settings[provider] = value;
    localStorage.setItem(STORAGE_NAME, JSON.stringify(settings));
  }

  /**
   * Update the UI schema of the form.
   * Currently use to hide API keys.
   */
  private _updateUiSchema(key: string) {
    if (key.toLowerCase().includes('key')) {
      this._uiSchema[key] = { 'ui:widget': 'password' };
    }
  }

  /**
   * update the settings schema for the generated one for each provider.
   */
  private _updateSchema(provider: string) {
    const newSchema = JSONExt.deepCopy(baseSettings) as any;
    this._uiSchema = {};
    const settingsSchema = (ProviderSettings[provider] as JSONSchema7) ?? null;
    if (settingsSchema) {
      Object.entries(settingsSchema).forEach(([key, value]) => {
        newSchema.properties[key] = value;
        this._updateUiSchema(key);
      });
    }
    this.setState({ schema: newSchema as JSONSchema7 });
  }

  /**
   * Triggered when the form value has changed.
   * - If the provider has changed, update the schema and restore the settings for
   * this provider from the local storage.
   * - If not, update the current settings and save it in local storage.
   *
   * Update the Jupyterlab settings accordingly.
   */
  private _onFormChange = (e: IChangeEvent) => {
    const provider = e.formData.provider;
    if (provider !== this._currentSettings.provider) {
      this._currentSettings = this.restoreSettings(provider);
      this._updateSchema(provider);
    } else {
      this._currentSettings = JSONExt.deepCopy(e.formData);
      this.saveSettings(provider, this._currentSettings);
    }
    this._settingsRegistry
      .set('provider', this._currentSettings)
      .catch(console.error);
  };

  render(): JSX.Element {
    return (
      <WrappedFormComponent
        formData={this._currentSettings}
        schema={this.state.schema}
        onChange={this._onFormChange}
        uiSchema={this._uiSchema}
        validator={validator}
      />
    );
  }

  private _currentSettings: IDict<any> = { provider: 'None' };
  private _uiSchema: IDict<any> = {};
  private _settingsRegistry: ISettingRegistry.ISettings;
}
