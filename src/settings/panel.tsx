import { IRenderMimeRegistry } from '@jupyterlab/rendermime';
import { ISettingRegistry } from '@jupyterlab/settingregistry';
import {
  Button,
  FormComponent,
  IFormRenderer
} from '@jupyterlab/ui-components';
import { JSONExt } from '@lumino/coreutils';
import { IChangeEvent } from '@rjsf/core';
import type { FieldProps } from '@rjsf/utils';
import validator from '@rjsf/validator-ajv8';
import { JSONSchema7 } from 'json-schema';
import { ISecretsManager } from 'jupyter-secrets-manager';
import React from 'react';

import { getSecretId, SECRETS_REPLACEMENT } from '.';
import baseSettings from './base.json';
import { IAIProviderRegistry, IDict, PLUGIN_IDS } from '../tokens';

const MD_MIME_TYPE = 'text/markdown';
const STORAGE_NAME = '@jupyterlite/ai:settings';
const INSTRUCTION_CLASS = 'jp-AISettingsInstructions';
const ERROR_CLASS = 'jp-AISettingsError';
const SECRETS_NAMESPACE = PLUGIN_IDS.providerRegistry;

export const aiSettingsRenderer = (options: {
  providerRegistry: IAIProviderRegistry;
  secretsToken?: symbol;
  rmRegistry?: IRenderMimeRegistry;
  secretsManager?: ISecretsManager;
}): IFormRenderer => {
  const { secretsToken } = options;
  delete options.secretsToken;
  if (secretsToken) {
    Private.setToken(secretsToken);
  }
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
  compatibilityError: string | null;
  isModified?: boolean;
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
    this._settings = props.formContext.settings;

    const useSecretsManagerSetting =
      (this._settings.get('UseSecretsManager').composite as boolean) ?? true;
    this._useSecretsManager =
      useSecretsManagerSetting && this._secretsManager !== null;

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
    // the setting registry (leads to default if there are no user settings).
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

    // Initialize the schema.
    const schema = this._buildSchema();

    // Initialize the current settings.
    const isModified = this._updatedFormData(
      this.getSettingsFromLocalStorage()
    );

    this.state = {
      schema,
      instruction: null,
      compatibilityError: null,
      isModified: isModified
    };
    this._renderInstruction();

    this._checkProviderCompatibility();

    // Update the setting registry.
    this.saveSettingsToRegistry();

    this._secretsManager?.fieldVisibilityChanged.connect(
      this._fieldVisibilityChanged
    );

    this._settings.changed.connect(this._settingsChanged);
  }

  async componentDidUpdate(): Promise<void> {
    if (!this._secretsManager || !this._useSecretsManager) {
      return;
    }

    // Attach the password inputs to the secrets manager.
    await this._secretsManager.detachAll(Private.getToken(), SECRETS_NAMESPACE);
    const inputs = this._formRef.current?.getElementsByTagName('input') || [];
    for (let i = 0; i < inputs.length; i++) {
      if (inputs[i].type.toLowerCase() === 'password') {
        const label = inputs[i].getAttribute('label');
        if (label) {
          const id = getSecretId(this._provider, label);
          this._secretsManager.attach(
            Private.getToken(),
            SECRETS_NAMESPACE,
            id,
            inputs[i],
            (value: string) => this._onPasswordUpdated(label, value)
          );
        }
      }
    }
  }

  componentWillUnmount(): void {
    this._settings.changed.disconnect(this._settingsChanged);
    this._secretsManager?.fieldVisibilityChanged.disconnect(
      this._fieldVisibilityChanged
    );
    if (!this._secretsManager || !this._useSecretsManager) {
      return;
    }
    this._secretsManager.detachAll(Private.getToken(), SECRETS_NAMESPACE);
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
  getSettingsFromLocalStorage(): IDict<any> {
    const settings = JSON.parse(localStorage.getItem(STORAGE_NAME) || '{}');
    return settings[this._provider] ?? { provider: this._provider };
  }

  /**
   * Save settings in local storage for a given provider.
   */
  saveSettingsToLocalStorage() {
    const currentSettings = { ...this._currentSettings };
    const settings = JSON.parse(localStorage.getItem(STORAGE_NAME) ?? '{}');
    // Do not save secrets in local storage if using the secrets manager.
    if (this._useSecretsManager) {
      this._secretFields.forEach(field => delete currentSettings[field]);
    }
    settings[this._provider] = currentSettings;
    localStorage.setItem(STORAGE_NAME, JSON.stringify(settings));
  }

  /**
   * Save the settings to the setting registry.
   */
  saveSettingsToRegistry(): void {
    const sanitizedSettings = { ...this._currentSettings };
    if (this._useSecretsManager) {
      this._secretFields.forEach(field => {
        sanitizedSettings[field] = SECRETS_REPLACEMENT;
      });
    }
    this._settings
      .set('AIprovider', { provider: this._provider, ...sanitizedSettings })
      .catch(console.error);
  }

  /**
   * Triggered when the settings has changed.
   */
  private _settingsChanged = (settings: ISettingRegistry.ISettings) => {
    this._updateUseSecretsManager(
      (this._settings.get('UseSecretsManager').composite as boolean) ?? true
    );
  };

  /**
   * Triggered when the secret fields visibility has changed.
   */
  private _fieldVisibilityChanged = (
    _: ISecretsManager,
    value: boolean
  ): void => {
    if (this._useSecretsManager) {
      this._updateSchema();
    }
  };

  /**
   * Update the settings whether the secrets manager is used or not.
   *
   * @param value - whether to use the secrets manager or not.
   */
  private _updateUseSecretsManager = (value: boolean) => {
    // No-op if the value did not change or the secrets manager has not been provided.
    if (value === this._useSecretsManager || this._secretsManager === null) {
      return;
    }

    // Update the secrets manager.
    this._useSecretsManager = value;
    if (!value) {
      // Detach all the password inputs attached to the secrets manager, and save the
      // current settings to the local storage to save the password.
      this._secretsManager.detachAll(Private.getToken(), SECRETS_NAMESPACE);
    } else {
      // Remove all the keys stored locally.
      const settings = JSON.parse(localStorage.getItem(STORAGE_NAME) || '{}');
      Object.keys(settings).forEach(provider => {
        Object.keys(settings[provider])
          .filter(key => key.toLowerCase().includes('key'))
          .forEach(key => {
            delete settings[provider][key];
          });
      });
      localStorage.setItem(STORAGE_NAME, JSON.stringify(settings));
    }
    this._updateSchema();
    this.saveSettingsToLocalStorage();
    this.saveSettingsToRegistry();
  };

  /**
   * Build the schema for a given provider.
   */
  private _buildSchema(): JSONSchema7 {
    const schema = JSONExt.deepCopy(baseSettings) as any;
    this._uiSchema = {};
    const settingsSchema = this._providerRegistry.getSettingsSchema(
      this._provider
    );

    this._secretFields = [];
    this._defaultFormData = {};
    if (settingsSchema) {
      Object.entries(settingsSchema).forEach(([key, value]) => {
        if (key.toLowerCase().includes('key')) {
          this._secretFields.push(key);

          // If the secrets manager is not used, do not show the secrets fields.
          // If the secrets manager is used, check if the fields should be visible.
          const showSecretFields =
            !this._useSecretsManager ||
            (this._secretsManager?.secretFieldsVisibility ?? true);
          if (!showSecretFields) {
            return;
          }

          this._uiSchema[key] = { 'ui:widget': 'password' };
        }
        schema.properties[key] = value;
        if (value.default !== undefined) {
          this._defaultFormData[key] = value.default;
        }
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
   * Check for compatibility of the provider with the current environment.
   * If the provider is not compatible, display an error message.
   */
  private async _checkProviderCompatibility(): Promise<void> {
    const compatibilityCheck = this._providerRegistry.getCompatibilityCheck(
      this._provider
    );
    if (!compatibilityCheck) {
      this.setState({ compatibilityError: null });
      return;
    }
    const error = await compatibilityCheck();
    if (!error) {
      this.setState({ compatibilityError: null });
      return;
    }
    const errorDiv = document.createElement('div');
    errorDiv.className = ERROR_CLASS;
    errorDiv.innerHTML = error;
    this.setState({ compatibilityError: error });
  }

  /**
   * Triggered when the provider has changed, to update the schema and values.
   * Update the Jupyterlab settings accordingly.
   */
  private _onProviderChanged = (e: IChangeEvent) => {
    const provider = e.formData.provider;
    if (provider === this._currentSettings.provider) {
      return;
    }
    this._provider = provider;
    this.saveCurrentProvider();
    this._updateSchema();
    this._renderInstruction();
    this._checkProviderCompatibility();

    // Initialize the current settings.
    const isModified = this._updatedFormData(
      this.getSettingsFromLocalStorage()
    );
    if (isModified !== this.state.isModified) {
      this.setState({ isModified });
    }
    this.saveSettingsToRegistry();
  };

  /**
   * Callback function called when the password input has been programmatically updated
   * with the secret manager.
   */
  private _onPasswordUpdated = (fieldName: string, value: string) => {
    this._currentSettings[fieldName] = value;
    this.saveSettingsToRegistry();
  };

  /**
   * Update the current settings with the new values from the form.
   *
   * @param data - The form data to update.
   * @returns - Boolean whether the form is not the default one.
   */
  private _updatedFormData(data: IDict): boolean {
    let isModified = false;
    Object.entries(data).forEach(([key, value]) => {
      if (this._defaultFormData[key] !== undefined) {
        if (value === undefined) {
          const schemaProperty = this.state.schema.properties?.[
            key
          ] as JSONSchema7;
          if (schemaProperty.type === 'string') {
            data[key] = '';
          }
        }
        if (value !== this._defaultFormData[key]) {
          isModified = true;
        }
      }
    });
    this._currentSettings = JSONExt.deepCopy(data);
    return isModified;
  }

  /**
   * Triggered when the form value has changed, to update the current settings and save
   * it in local storage.
   * Update the Jupyterlab settings accordingly.
   */
  private _onFormChanged = (e: IChangeEvent): void => {
    const { formData } = e;
    const isModified = this._updatedFormData(formData);
    this.saveSettingsToLocalStorage();
    this.saveSettingsToRegistry();
    if (isModified !== this.state.isModified) {
      this.setState({ isModified });
    }
  };

  /**
   * Handler for the "Restore to defaults" button - clears all
   * modified settings then calls `setFormData` to restore the
   * values.
   */
  private _reset = async (event: React.MouseEvent): Promise<void> => {
    event.stopPropagation();
    this._currentSettings = {
      ...this._currentSettings,
      ...this._defaultFormData
    };
    this.saveSettingsToLocalStorage();
    this.saveSettingsToRegistry();
    this.setState({ isModified: false });
  };

  render(): JSX.Element {
    return (
      <div ref={this._formRef}>
        <WrappedFormComponent
          formData={{ provider: this._provider }}
          schema={this._providerSchema}
          onChange={this._onProviderChanged}
        />
        {this.state.compatibilityError !== null && (
          <div className={ERROR_CLASS}>
            <i className={'fas fa-exclamation-triangle'}></i>
            <span>{this.state.compatibilityError}</span>
          </div>
        )}
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
        <div className="jp-SettingsHeader">
          <h3 title={this._provider}>{this._provider}</h3>
          <div className="jp-SettingsHeader-buttonbar">
            {this.state.isModified && (
              <Button className="jp-RestoreButton" onClick={this._reset}>
                Restore to Defaults
              </Button>
            )}
          </div>
        </div>
        <WrappedFormComponent
          formData={this._currentSettings}
          schema={this.state.schema}
          onChange={this._onFormChanged}
          uiSchema={this._uiSchema}
          idPrefix={`jp-SettingsEditor-${PLUGIN_IDS.providerRegistry}`}
          formContext={{
            ...this.props.formContext,
            defaultFormData: this._defaultFormData
          }}
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
  private _currentSettings: IDict<any> = { provider: 'None' };
  private _uiSchema: IDict<any> = {};
  private _settings: ISettingRegistry.ISettings;
  private _formRef = React.createRef<HTMLDivElement>();
  private _secretFields: string[] = [];
  private _defaultFormData: IDict<any> = {};
}

namespace Private {
  /**
   * The token to use with the secrets manager.
   */
  let secretsToken: symbol;

  /**
   * Set of the token.
   */
  export function setToken(value: symbol): void {
    secretsToken = value;
  }

  /**
   * get the token.
   */
  export function getToken(): symbol {
    return secretsToken;
  }
}
