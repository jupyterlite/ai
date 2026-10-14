import { ISettingRegistry } from '@jupyterlab/settingregistry';
import { ISignal, Signal } from '@lumino/signaling';

import {
  IPersonaKitConfig,
  IPersonaKitSettings,
  KIT_SETTINGS_ID
} from './tokens';

/**
 * The persona kit settings, backed by the JupyterLab setting registry.
 */
export class PersonaKitSettings implements IPersonaKitSettings {
  constructor(options: PersonaKitSettings.IOptions) {
    this._registry = options.settingRegistry;
    this.ready = this._load();
  }

  readonly ready: Promise<void>;

  get config(): IPersonaKitConfig {
    return { ...this._config };
  }

  get changed(): ISignal<IPersonaKitSettings, void> {
    return this._changed;
  }

  async update(updates: Partial<IPersonaKitConfig>): Promise<void> {
    await this.ready;
    if (!this._settings) {
      this._config = { ...this._config, ...updates };
      this._changed.emit();
      return;
    }
    for (const [key, value] of Object.entries(updates)) {
      await this._settings.set(key, value);
    }
  }

  private async _load(): Promise<void> {
    try {
      this._settings = await this._registry.load(KIT_SETTINGS_ID);
    } catch (error) {
      console.warn('Failed to load the persona kit settings:', error);
      return;
    }
    this._read();
    this._settings.changed.connect(this._read, this);
  }

  private _read(): void {
    this._config = {
      ...this._config,
      ...(this._settings?.composite as Partial<IPersonaKitConfig>)
    };
    this._changed.emit();
  }

  private _config: IPersonaKitConfig = {
    commandsRequiringApproval: [
      'notebook:restart-run-all',
      'notebook:run-cell',
      'notebook:run-cell-and-select-next',
      'notebook:run-cell-and-insert-below',
      'notebook:run-all-cells',
      'notebook:run-all-above',
      'notebook:run-all-below',
      'console:execute',
      'console:execute-forced',
      'fileeditor:run-code',
      'kernelmenu:run',
      'kernelmenu:restart-and-run-all',
      'runmenu:run-all',
      'jupyterlab-ai-commands:run-cell'
    ],
    commandsAutoRenderMimeBundles: ['jupyterlab-ai-commands:execute-in-kernel'],
    trustedMimeTypesForAutoRender: ['text/html'],
    skillsPaths: ['.agents/skills', '_agents/skills']
  };
  private _registry: ISettingRegistry;
  private _settings: ISettingRegistry.ISettings | null = null;
  private _changed = new Signal<IPersonaKitSettings, void>(this);
}

export namespace PersonaKitSettings {
  export interface IOptions {
    settingRegistry: ISettingRegistry;
  }
}
