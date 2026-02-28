/*
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */

import type { AISettingsModel, IProviderConfig } from './models/settings-model';
import type { ISkillRegistry } from './tokens';

/**
 * Fields that must never be exposed via the global API because they
 * may contain secrets (API keys, auth headers, etc.).
 */
const SENSITIVE_FIELDS: ReadonlySet<string> = new Set([
  'apiKey',
  'headers',
  'customSettings'
]);

/**
 * A provider config with sensitive fields stripped for safe exposure.
 */
type ISanitizedProviderConfig = Omit<
  IProviderConfig,
  'apiKey' | 'headers' | 'customSettings'
>;

/**
 * Shape of the globalThis.jupyter_ai object exposed for
 * external (non-extension) JavaScript code.
 *
 * All properties are read-only frozen snapshots that update
 * when the underlying state changes. The `globalThis.jupyter_ai`
 * reference itself is replaced on each update, so always read
 * the latest value rather than caching a reference.
 */
export interface IJupyterAIGlobalAPI {
  /**
   * Read-only snapshot of registered skills (name + description).
   * Updated whenever the skill registry changes.
   */
  readonly skills: ReadonlyArray<
    Readonly<{ name: string; description: string }>
  >;

  /**
   * The currently active provider configuration (API keys stripped).
   * null if no provider is configured.
   */
  readonly active_providers: Readonly<{
    id: string;
    provider: string;
    model: string;
    name: string;
    baseURL?: string;
  }> | null;

  /**
   * Read-only snapshot of the AI settings (API keys stripped from
   * provider entries). Updated whenever settings change.
   */
  readonly settings: Readonly<{
    [K in string]: unknown;
  }> & {
    readonly providers: ReadonlyArray<Readonly<ISanitizedProviderConfig>>;
  };
}

// Global type augmentation so TypeScript recognises globalThis.jupyter_ai.
declare global {
  // eslint-disable-next-line no-var
  var jupyter_ai: IJupyterAIGlobalAPI | undefined;
}

/**
 * Initialise the `globalThis.jupyter_ai` namespace and keep it in
 * sync with the skill registry and settings model.
 */
export function initializeGlobalAPI(
  settingsModel: AISettingsModel,
  skillRegistry: ISkillRegistry
): void {
  globalThis.jupyter_ai = buildFullSnapshot(settingsModel, skillRegistry);

  skillRegistry.skillsChanged.connect(() => {
    updateGlobalAPI({ skills: buildSkillsSnapshot(skillRegistry) });
  });

  settingsModel.stateChanged.connect(() => {
    updateGlobalAPI({
      active_providers: buildActiveProviderSnapshot(settingsModel),
      settings: buildSettingsSnapshot(settingsModel)
    });
  });
}

// ---------------------------------------------------------------------------
// Snapshot builders
// ---------------------------------------------------------------------------

function buildFullSnapshot(
  settingsModel: AISettingsModel,
  skillRegistry: ISkillRegistry
): IJupyterAIGlobalAPI {
  return Object.freeze({
    skills: buildSkillsSnapshot(skillRegistry),
    active_providers: buildActiveProviderSnapshot(settingsModel),
    settings: buildSettingsSnapshot(settingsModel)
  });
}

function buildSkillsSnapshot(
  skillRegistry: ISkillRegistry
): IJupyterAIGlobalAPI['skills'] {
  return Object.freeze(
    skillRegistry
      .listSkills()
      .map(s => Object.freeze({ name: s.name, description: s.description }))
  );
}

function buildActiveProviderSnapshot(
  settingsModel: AISettingsModel
): IJupyterAIGlobalAPI['active_providers'] {
  const config = settingsModel.config;
  const provider = settingsModel.getProvider(config.defaultProvider);
  if (!provider) {
    return null;
  }
  return Object.freeze({
    id: provider.id,
    provider: provider.provider,
    model: provider.model,
    name: provider.name,
    ...(provider.baseURL ? { baseURL: provider.baseURL } : {})
  });
}

function buildSettingsSnapshot(
  settingsModel: AISettingsModel
): IJupyterAIGlobalAPI['settings'] {
  const config = settingsModel.config;
  const sanitizedProviders = config.providers.map(
    (p: IProviderConfig): ISanitizedProviderConfig => {
      const sanitized: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(p)) {
        if (!SENSITIVE_FIELDS.has(key)) {
          sanitized[key] = value;
        }
      }
      return Object.freeze(sanitized) as ISanitizedProviderConfig;
    }
  );
  return Object.freeze({
    ...config,
    providers: Object.freeze(sanitizedProviders)
  });
}

function updateGlobalAPI(updates: Partial<IJupyterAIGlobalAPI>): void {
  if (!globalThis.jupyter_ai) {
    return;
  }
  globalThis.jupyter_ai = Object.freeze({
    ...globalThis.jupyter_ai,
    ...updates
  });
}
