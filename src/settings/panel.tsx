import { IRenderMimeRegistry } from '@jupyterlab/rendermime';
import { ISettingRegistry } from '@jupyterlab/settingregistry';
import { FormComponent, IFormRenderer } from '@jupyterlab/ui-components';
import { JSONExt } from '@lumino/coreutils';
import { IChangeEvent } from '@rjsf/core';
import type { FieldProps } from '@rjsf/utils';
import validator from '@rjsf/validator-ajv8';
import { JSONSchema7 } from 'json-schema';
import React from 'react';

import { IDict, instructions } from './instructions';
import baseSettings from './schemas/base.json';
import ProviderSettings from './schemas';

const MD_MIME_TYPE = 'text/markdown';
const STORAGE_NAME = '@jupyterlite/ai:settings';
const INSTRUCTION_CLASS = 'jp-lite-ai-settings-instruction';

export const aiSettingsRenderer: IFormRenderer = {
  fieldRenderer: (props: FieldProps) => <AiSettings {...props} />
};

export interface ISettingsFormStates {
  schema: JSONSchema7;
  instruction: HTMLElement | null;
}

const WrappedFormComponent = (props: any): JSX.Element => {
  return <FormComponent {...props} validator={validator} />;
};

export class AiSettings extends React.Component<
  FieldProps,
  ISettingsFormStates
> {
  static rmRegistry: IRenderMimeRegistry | null = null;

  constructor(props: FieldProps) {
    super(props);
    this._settingsRegistry = props.formContext.settings;

    // Initialize the providers schema
    const providerSchema = JSONExt.deepCopy(baseSettings) as any;
    providerSchema.properties.provider = {
      type: 'string',
      title: 'Provider',
      description: 'The AI provider to use for chat and completion',
      default: 'None',
      enum: ['None'].concat(Object.keys(ProviderSettings))
    };
    this._providerSchema = providerSchema as JSONSchema7;

    // Check if there is saved values in storage, otherwise save the default values in
    // local storage if default are provided.
    const backupSettings = localStorage.getItem(STORAGE_NAME);
    if (backupSettings === null) {
      const defaultSettings = this._settingsRegistry.default('AIprovider');
      if (
        defaultSettings &&
        Object.keys(defaultSettings).includes('provider')
      ) {
        // Get the provider name.
        const provider = Object.entries(defaultSettings).find(
          v => v[0] === 'provider'
        )?.[1] as string;
        // Save the settings.
        const settings: any = {
          _current: provider
        };
        settings[provider] = defaultSettings;
        localStorage.setItem(STORAGE_NAME, JSON.stringify(settings));
      }
    }

    // Initialize the settings from saved one
    this._provider = this.getCurrentProvider();
    this._currentSettings = this.getSettings();

    // Initialize the schema
    const schema = this._buildSchema();
    this.state = { schema, instruction: null };

    this._renderInstruction();

    // Update the setting registry
    this._settingsRegistry
      .set('AIprovider', this._currentSettings)
      .catch(console.error);
  }

  async _renderInstruction(): Promise<void> {
    if (!AiSettings.rmRegistry || !instructions[this._provider]) {
      this.setState({ instruction: null });
      return;
    }
    let mdStr = instructions[this._provider];
    mdStr = `---\n\n${mdStr}\n\n---`;
    const renderer = AiSettings.rmRegistry.createRenderer(MD_MIME_TYPE);
    const model = AiSettings.rmRegistry.createModel({
      data: { [MD_MIME_TYPE]: mdStr }
    });
    await renderer.renderModel(model);
    this.setState({ instruction: renderer.node });
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
  saveCurrentProvider(): void {
    const settings = JSON.parse(localStorage.getItem(STORAGE_NAME) || '{}');
    settings['_current'] = this._provider;
    localStorage.setItem(STORAGE_NAME, JSON.stringify(settings));
  }

  /**
   * Get settings from local storage for a given provider.
   */
  getSettings(): IDict<any> {
    const settings = JSON.parse(localStorage.getItem(STORAGE_NAME) || '{}');
    return settings[this._provider] ?? { provider: this._provider };
  }

  /**
   * Save settings in local storage for a given provider.
   */
  saveSettings(value: IDict<any>) {
    const settings = JSON.parse(localStorage.getItem(STORAGE_NAME) ?? '{}');
    settings[this._provider] = value;
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
  private _buildSchema(): JSONSchema7 {
    const schema = JSONExt.deepCopy(baseSettings) as any;
    this._uiSchema = {};
    const settingsSchema =
      (ProviderSettings[this._provider]?.properties as JSONSchema7) ?? null;
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
  private _updateSchema() {
    const schema = this._buildSchema();
    this.setState({ schema });
  }

  /**
   * Triggered when the provider hes changed, to update the schema and values.
   * Update the Jupyterlab settings accordingly.
   */
  private _onProviderChanged = (e: IChangeEvent) => {
    const provider = e.formData.provider;
    if (provider === this._currentSettings.provider) {
      return;
    }
    this._provider = provider;
    this.saveCurrentProvider();
    this._currentSettings = this.getSettings();
    this._updateSchema();
    this._renderInstruction();
    this._settingsRegistry
      .set('AIprovider', { provider: this._provider, ...this._currentSettings })
      .catch(console.error);
  };

  /**
   * Triggered when the form value has changed, to update the current settings and save
   * it in local storage.
   * Update the Jupyterlab settings accordingly.
   */
  private _onFormChange = (e: IChangeEvent) => {
    this._currentSettings = JSONExt.deepCopy(e.formData);
    this.saveSettings(this._currentSettings);
    this._settingsRegistry
      .set('AIprovider', { provider: this._provider, ...this._currentSettings })
      .catch(console.error);
  };

  render(): JSX.Element {
    return (
      <>
        <WrappedFormComponent
          formData={{ provider: this._provider }}
          schema={this._providerSchema}
          onChange={this._onProviderChanged}
        />
        {this.state.instruction !== null && (
          <details>
            <summary className={INSTRUCTION_CLASS}>Instructions</summary>
            <span
              ref={node =>
                node && node.replaceChildren(this.state.instruction!)
              }
            />
          </details>
        )}
        <WrappedFormComponent
          formData={this._currentSettings}
          schema={this.state.schema}
          onChange={this._onFormChange}
          uiSchema={this._uiSchema}
        />
      </>
    );
  }

  private _provider: string;
  private _providerSchema: JSONSchema7;
  private _currentSettings: IDict<any> = { provider: 'None' };
  private _uiSchema: IDict<any> = {};
  private _settingsRegistry: ISettingRegistry.ISettings;
}
