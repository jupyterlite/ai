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

    // Initialize the settings from saved one
    const provider = this.getCurrentProvider();
    this._currentSettings = this.getSettings(provider);

    // Initialize the schema
    const schema = this._buildSchema(provider);
    this.state = { schema };

    // Update the setting registry
    this._settingsRegistry
      .set('AIprovider', this._currentSettings)
      .catch(console.error);
  }

  /**
   * Get the current provider from the local storage.
   */
  getCurrentProvider(): string {
    const settings = JSON.parse(localStorage.getItem(STORAGE_NAME) || '{}');
    return settings['_current'] ?? 'None';
  }

  /**
   * Save the current provider to the local storage.
   */
  saveCurrentProvider(provider: string): void {
    const settings = JSON.parse(localStorage.getItem(STORAGE_NAME) || '{}');
    settings['_current'] = provider;
    localStorage.setItem(STORAGE_NAME, JSON.stringify(settings));
  }

  /**
   * Get settings from local storage for a given provider.
   */
  getSettings(provider: string): IDict<any> {
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
   * Build the schema for a given provider.
   */
  private _buildSchema(provider: string): JSONSchema7 {
    const schema = JSONExt.deepCopy(baseSettings) as any;
    this._uiSchema = {};
    const settingsSchema =
      (ProviderSettings[provider]?.properties as JSONSchema7) ?? null;
    if (settingsSchema) {
      Object.entries(settingsSchema).forEach(([key, value]) => {
        schema.properties[key] = value;
        this._updateUiSchema(key);
      });
    }
    return schema as JSONSchema7;
  }

  /**
   * Update the schema state for the given provider, that trigger the re-rendering of
   * the component.
   */
  private _updateSchema(provider: string) {
    const schema = this._buildSchema(provider);
    this.setState({ schema });
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
      this.saveCurrentProvider(provider);
      this._currentSettings = this.getSettings(provider);
      this._updateSchema(provider);
    } else {
      this._currentSettings = JSONExt.deepCopy(e.formData);
      this.saveSettings(provider, this._currentSettings);
    }
    this._settingsRegistry
      .set('AIprovider', this._currentSettings)
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
