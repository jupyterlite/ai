import { IRenderMimeRegistry } from '@jupyterlab/rendermime';
import {
  ISettingConnector,
  ISettingRegistry
} from '@jupyterlab/settingregistry';
import { FormComponent, IFormRenderer } from '@jupyterlab/ui-components';
import { ArrayExt } from '@lumino/algorithm';
import { JSONExt } from '@lumino/coreutils';
import { IChangeEvent } from '@rjsf/core';
import type { FieldProps } from '@rjsf/utils';
import validator from '@rjsf/validator-ajv8';
import { JSONSchema7 } from 'json-schema';
import { ISecretsManager } from 'jupyter-secrets-manager';
import React from 'react';

import { getSecretId, SECRETS_NAMESPACE, SettingConnector } from '.';
import baseSettings from './base.json';
import { IAIProviderRegistry, IDict } from '../tokens';

const MD_MIME_TYPE = 'text/markdown';
const STORAGE_NAME = '@jupyterlite/ai:settings';
const INSTRUCTION_CLASS = 'jp-AISettingsInstructions';

export const aiSettingsRenderer = (options: {
  providerRegistry: IAIProviderRegistry;
  rmRegistry?: IRenderMimeRegistry;
  secretsManager?: ISecretsManager;
  settingConnector?: ISettingConnector;
}): IFormRenderer => {
  return {
    fieldRenderer: (props: FieldProps) => {
      props.formContext = { ...props.formContext, ...options };
      return <AiSettings {...props} />;
    }
  };
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
  constructor(props: FieldProps) {
    super(props);
    if (!props.formContext.providerRegistry) {
      throw new Error(
        'The provider registry is needed to enable the jupyterlite-ai settings panel'
      );
    }
    this._providerRegistry = props.formContext.providerRegistry;
    this._rmRegistry = props.formContext.rmRegistry ?? null;
    this._secretsManager = props.formContext.secretsManager ?? null;
    this._settingConnector = props.formContext.settingConnector ?? null;
    this._settings = props.formContext.settings;

    this._useSecretsManager =
      (this._settings.get('UseSecretsManager').composite as boolean) ?? true;

    // Initialize the providers schema.
    const providerSchema = JSONExt.deepCopy(baseSettings) as any;
    providerSchema.properties.provider = {
      type: 'string',
      title: 'Provider',
      description: 'The AI provider to use for chat and completion',
      default: 'None',
      enum: ['None'].concat(this._providerRegistry.providers)
    };
    this._providerSchema = providerSchema as JSONSchema7;

    // Check if there is saved values in local storage, otherwise use the settings from
    // the setting registry (led to default if there are no user settings).
    const storageSettings = localStorage.getItem(STORAGE_NAME);
    if (storageSettings === null) {
      const labSettings = this._settings.get('AIprovider').composite;
      if (labSettings && Object.keys(labSettings).includes('provider')) {
        // Get the provider name.
        const provider = Object.entries(labSettings).find(
          v => v[0] === 'provider'
        )?.[1] as string;
        // Save the settings.
        const settings: any = {
          _current: provider
        };
        settings[provider] = labSettings;
        localStorage.setItem(STORAGE_NAME, JSON.stringify(settings));
      }
    }

    // Initialize the settings from the saved ones.
    this._provider = this.getCurrentProvider();
    this._currentSettings = this.getSettings();

    // Initialize the schema.
    const schema = this._buildSchema();
    this.state = { schema, instruction: null };

    this._renderInstruction();

    // Update the setting registry.
    this._settings
      .set('AIprovider', this._currentSettings)
      .catch(console.error);

    this._settings.changed.connect(() => {
      const useSecretsManager =
        (this._settings.get('UseSecretsManager').composite as boolean) ?? true;
      if (useSecretsManager !== this._useSecretsManager) {
        this.updateUseSecretsManager(useSecretsManager);
      }
    });
  }

  async componentDidUpdate(): Promise<void> {
    if (!this._secretsManager || !this._useSecretsManager) {
      return;
    }
    // Attach the password inputs to the secrets manager only if they have changed.
    const inputs = this._formRef.current?.getElementsByTagName('input') || [];
    if (ArrayExt.shallowEqual(inputs, this._formInputs)) {
      return;
    }

    await this._secretsManager.detachAll(SECRETS_NAMESPACE);
    this._formInputs = [...inputs];
    this._unsavedFields = [];
    for (let i = 0; i < inputs.length; i++) {
      if (inputs[i].type.toLowerCase() === 'password') {
        const label = inputs[i].getAttribute('label');
        if (label) {
          const id = getSecretId(this._provider, label);
          this._secretsManager.attach(
            SECRETS_NAMESPACE,
            id,
            inputs[i],
            (value: string) => this._onPasswordUpdated(label, value)
          );
          this._unsavedFields.push(label);
        }
      }
    }
    if (this._settingConnector instanceof SettingConnector) {
      this._settingConnector.doNotSave = this._unsavedFields;
    }
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
    const currentSettings = { ...value };
    const settings = JSON.parse(localStorage.getItem(STORAGE_NAME) ?? '{}');
    this._unsavedFields.forEach(field => delete currentSettings[field]);
    settings[this._provider] = currentSettings;
    localStorage.setItem(STORAGE_NAME, JSON.stringify(settings));
  }

  private updateUseSecretsManager = (value: boolean) => {
    this._useSecretsManager = value;
    if (!value) {
      // Detach all the password inputs attached to the secrets manager, and save the
      // current settings to the local storage to save the password.
      this._secretsManager?.detachAll(SECRETS_NAMESPACE);
      this._formInputs = [];
      this._unsavedFields = [];
      if (this._settingConnector instanceof SettingConnector) {
        this._settingConnector.doNotSave = [];
      }
      this.saveSettings(this._currentSettings);
    } else {
      // Remove all the keys stored locally and attach the password inputs to the
      // secrets manager.
      const settings = JSON.parse(localStorage.getItem(STORAGE_NAME) || '{}');
      Object.keys(settings).forEach(provider => {
        Object.keys(settings[provider])
          .filter(key => key.toLowerCase().includes('key'))
          .forEach(key => {
            delete settings[provider][key];
          });
      });
      localStorage.setItem(STORAGE_NAME, JSON.stringify(settings));
      this.componentDidUpdate();
    }
    this._settings
      .set('AIprovider', { provider: this._provider, ...this._currentSettings })
      .catch(console.error);
  };

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
    const settingsSchema = this._providerRegistry.getSettingsSchema(
      this._provider
    );

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
   * Render the markdown instructions for the current provider.
   */
  private async _renderInstruction(): Promise<void> {
    let instructions = this._providerRegistry.getInstructions(this._provider);
    if (!this._rmRegistry || !instructions) {
      this.setState({ instruction: null });
      return;
    }
    instructions = `---\n\n${instructions}\n\n---`;
    const renderer = this._rmRegistry.createRenderer(MD_MIME_TYPE);
    const model = this._rmRegistry.createModel({
      data: { [MD_MIME_TYPE]: instructions }
    });
    await renderer.renderModel(model);
    this.setState({ instruction: renderer.node });
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
    this._settings
      .set('AIprovider', { provider: this._provider, ...this._currentSettings })
      .catch(console.error);
  };

  /**
   * Callback function called when the password input has been programmatically updated
   * with the secret manager.
   */
  private _onPasswordUpdated = (fieldName: string, value: string) => {
    this._currentSettings[fieldName] = value;
    this._settings
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
    this._settings
      .set('AIprovider', { provider: this._provider, ...this._currentSettings })
      .catch(console.error);
  };

  render(): JSX.Element {
    return (
      <div ref={this._formRef}>
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
      </div>
    );
  }

  private _providerRegistry: IAIProviderRegistry;
  private _provider: string;
  private _providerSchema: JSONSchema7;
  private _useSecretsManager: boolean;
  private _rmRegistry: IRenderMimeRegistry | null;
  private _secretsManager: ISecretsManager | null;
  private _settingConnector: ISettingConnector | null;
  private _currentSettings: IDict<any> = { provider: 'None' };
  private _uiSchema: IDict<any> = {};
  private _settings: ISettingRegistry.ISettings;
  private _formRef = React.createRef<HTMLDivElement>();
  private _unsavedFields: string[] = [];
  private _formInputs: HTMLInputElement[] = [];
}
