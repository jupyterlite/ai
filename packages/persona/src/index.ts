import {
  anthropicProvider,
  createBrowserFetchTool,
  createDiscoverCommandsTool,
  createDiscoverSkillsTool,
  createExecuteCommandTool,
  createLoadSkillTool,
  genericProvider,
  googleProvider,
  loadSkillsFromPaths,
  mistralProvider,
  openaiProvider,
  AgentManagerFactory,
  IAgentManagerFactory,
  IAISettingsModel,
  IDiffManager,
  IProviderRegistry,
  IToolRegistry,
  ISkillRegistry,
  ProviderRegistry,
  SECRETS_NAMESPACE,
  SkillRegistry,
  ToolRegistry
} from '@jupyternaut/agent';

import type { IAISecretsAccess } from '@jupyternaut/agent';

import {
  ILayoutRestorer,
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';

import { IChatTracker, MainAreaChat, ChatWidget } from '@jupyter/chat';

import { ICommandPalette, IThemeManager } from '@jupyterlab/apputils';

import { ICompletionProviderManager } from '@jupyterlab/completer';

import { IDocumentManager } from '@jupyterlab/docmanager';

import { ISettingRegistry } from '@jupyterlab/settingregistry';

import { IStatusBar } from '@jupyterlab/statusbar';

import { PathExt } from '@jupyterlab/coreutils';

import { ITranslator, nullTranslator } from '@jupyterlab/translation';

import { settingsIcon } from '@jupyterlab/ui-components';

import { DisposableSet } from '@lumino/disposable';

import { ISecretsManager, SecretsManager } from 'jupyter-secrets-manager';

import { PersonaHandler } from './persona-handler';

import { CommandIds, IPersonaHandlerRegistry } from './tokens';

import { PersonaHandlerRegistry } from './persona-handler-registry';

import { AICompletionProvider } from './completion';

import { CompletionStatusWidget } from './components';

import { AISettingsModel } from './models/settings-model';

import { DiffManager } from './diff-manager';

import { AISettingsWidget } from './widgets/ai-settings';

const PERSONA_MENTION = '@jupyternaut-frontend';

namespace Private {
  let aiSecretsToken: symbol | null = null;

  export function setAISecretsToken(token: symbol | null): void {
    aiSecretsToken = token;
  }

  export function createAISecretsAccess(
    secretsManager?: ISecretsManager
  ): IAISecretsAccess {
    return {
      get isAvailable() {
        return !!(aiSecretsToken && secretsManager);
      },
      async get(id: string): Promise<string | undefined> {
        if (!aiSecretsToken || !secretsManager) {
          return;
        }
        const secret = await secretsManager.get(
          aiSecretsToken,
          SECRETS_NAMESPACE,
          id
        );
        return secret?.value;
      },
      async set(id: string, value: string): Promise<void> {
        if (!aiSecretsToken || !secretsManager) {
          return;
        }
        await secretsManager.set(aiSecretsToken, SECRETS_NAMESPACE, id, {
          namespace: SECRETS_NAMESPACE,
          id,
          value
        });
      },
      async attach(
        id: string,
        input: HTMLInputElement,
        callback?: (value: string) => void
      ): Promise<void> {
        if (!aiSecretsToken || !secretsManager) {
          return;
        }
        await secretsManager.attach(
          aiSecretsToken,
          SECRETS_NAMESPACE,
          id,
          input,
          callback
        );
      }
    };
  }
}

/**
 * Provider registry plugin
 */
const providerRegistryPlugin: JupyterFrontEndPlugin<IProviderRegistry> = {
  id: '@jupyternaut/persona:provider-registry',
  description: 'AI provider registry',
  autoStart: true,
  provides: IProviderRegistry,
  activate: () => {
    return new ProviderRegistry();
  }
};

/**
 * Anthropic provider plugin
 */
const anthropicProviderPlugin: JupyterFrontEndPlugin<void> = {
  id: '@jupyternaut/persona:anthropic-provider',
  description: 'Register Anthropic provider',
  autoStart: true,
  requires: [IProviderRegistry],
  activate: (app: JupyterFrontEnd, providerRegistry: IProviderRegistry) => {
    providerRegistry.registerProvider(anthropicProvider);
  }
};

/**
 * Google provider plugin
 */
const googleProviderPlugin: JupyterFrontEndPlugin<void> = {
  id: '@jupyternaut/persona:google-provider',
  description: 'Register Google Generative AI provider',
  autoStart: true,
  requires: [IProviderRegistry],
  activate: (app: JupyterFrontEnd, providerRegistry: IProviderRegistry) => {
    providerRegistry.registerProvider(googleProvider);
  }
};

/**
 * Mistral provider plugin
 */
const mistralProviderPlugin: JupyterFrontEndPlugin<void> = {
  id: '@jupyternaut/persona:mistral-provider',
  description: 'Register Mistral provider',
  autoStart: true,
  requires: [IProviderRegistry],
  activate: (app: JupyterFrontEnd, providerRegistry: IProviderRegistry) => {
    providerRegistry.registerProvider(mistralProvider);
  }
};

/**
 * OpenAI provider plugin
 */
const openaiProviderPlugin: JupyterFrontEndPlugin<void> = {
  id: '@jupyternaut/persona:openai-provider',
  description: 'Register OpenAI provider',
  autoStart: true,
  requires: [IProviderRegistry],
  activate: (app: JupyterFrontEnd, providerRegistry: IProviderRegistry) => {
    providerRegistry.registerProvider(openaiProvider);
  }
};

/**
 * Generic provider plugin
 */
const genericProviderPlugin: JupyterFrontEndPlugin<void> = {
  id: '@jupyternaut/persona:generic-provider',
  description: 'Register Generic OpenAI-compatible provider',
  autoStart: true,
  requires: [IProviderRegistry],
  activate: (app: JupyterFrontEnd, providerRegistry: IProviderRegistry) => {
    providerRegistry.registerProvider(genericProvider);
  }
};

const personaHandlerRegistryPlugin: JupyterFrontEndPlugin<IPersonaHandlerRegistry> =
  {
    id: '@jupyternaut/persona:handler-registry',
    description: 'Registry mapping chat models to their persona handlers',
    autoStart: true,
    provides: IPersonaHandlerRegistry,
    activate: (): IPersonaHandlerRegistry => {
      return new PersonaHandlerRegistry();
    }
  };

const plugin: JupyterFrontEndPlugin<void> = {
  id: '@jupyternaut/persona:plugin',
  description: 'jupyternaut frontend persona',
  autoStart: true,
  requires: [IAgentManagerFactory, IAISettingsModel, IPersonaHandlerRegistry],
  optional: [IChatTracker, IProviderRegistry, IToolRegistry],
  activate: (
    app: JupyterFrontEnd,
    agentManagerFactory: IAgentManagerFactory,
    settingsModel: IAISettingsModel,
    registry: IPersonaHandlerRegistry,
    chatTracker: IChatTracker | null,
    providerRegistry?: IProviderRegistry,
    toolRegistry?: IToolRegistry
  ) => {
    if (!chatTracker) {
      return;
    }

    const attachPersona = (widget: ChatWidget | MainAreaChat) => {
      if (registry.get(widget.model)) {
        return;
      }

      const agentManager = agentManagerFactory.createAgent({
        settingsModel,
        providerRegistry,
        toolRegistry
      });
      const handler = new PersonaHandler({
        model: widget.model,
        agentManager,
        trigger: PERSONA_MENTION
      });
      registry.register(widget.model, handler);
      widget.disposed.connect(() => {
        handler.dispose();
        registry.unregister(widget.model);
      });
    };

    chatTracker.forEach(widget => attachPersona(widget));
    chatTracker.widgetAdded.connect((_, widget) => attachPersona(widget));
  }
};

/**
 * A plugin to provide the agent manager factory and completion provider.
 * These objects require the secrets manager token with the same namespace.
 */
const agentManagerFactory: JupyterFrontEndPlugin<IAgentManagerFactory> =
  SecretsManager.sign(SECRETS_NAMESPACE, token => {
    Private.setAISecretsToken(token);

    return {
      id: SECRETS_NAMESPACE,
      description: 'Provide the AI agent manager',
      autoStart: true,
      provides: IAgentManagerFactory,
      requires: [IAISettingsModel, IProviderRegistry],
      optional: [ISkillRegistry, ICompletionProviderManager, ISecretsManager],
      activate: (
        app: JupyterFrontEnd,
        settingsModel: IAISettingsModel,
        providerRegistry: IProviderRegistry,
        skillRegistry?: ISkillRegistry,
        completionManager?: ICompletionProviderManager,
        secretsManager?: ISecretsManager
      ): IAgentManagerFactory => {
        const agentManagerFactory = new AgentManagerFactory({
          settingsModel,
          skillRegistry,
          secretsManager,
          token
        });

        // Build the completion provider
        if (completionManager) {
          const completionProvider = new AICompletionProvider({
            settingsModel,
            providerRegistry,
            secretsManager,
            token
          });

          completionManager.registerInlineProvider(completionProvider);
        } else {
          console.info(
            'Completion provider manager not available, skipping AI completion setup'
          );
        }

        return agentManagerFactory;
      }
    };
  });

/**
 * AI settings panel plugin.
 */
const settingsPanelPlugin: JupyterFrontEndPlugin<void> = {
  id: '@jupyternaut/persona:settings-panel',
  description: 'Provide the AI settings panel',
  autoStart: true,
  requires: [IAISettingsModel, IAgentManagerFactory, IProviderRegistry],
  optional: [
    ICommandPalette,
    ILayoutRestorer,
    ISecretsManager,
    IThemeManager,
    ITranslator
  ],
  activate: (
    app: JupyterFrontEnd,
    settingsModel: IAISettingsModel,
    agentManagerFactory: IAgentManagerFactory,
    providerRegistry: IProviderRegistry,
    palette?: ICommandPalette,
    restorer?: ILayoutRestorer,
    secretsManager?: ISecretsManager,
    themeManager?: IThemeManager,
    translator?: ITranslator
  ): void => {
    const trans = (translator ?? nullTranslator).load('jupyterlite_ai');
    const secretsAccess = Private.createAISecretsAccess(secretsManager);

    const settingsWidget = new AISettingsWidget({
      settingsModel,
      agentManagerFactory,
      themeManager,
      providerRegistry,
      secretsAccess,
      trans
    });
    settingsWidget.title.icon = settingsIcon;
    settingsWidget.title.iconClass = 'jp-ai-settings-icon';

    const open = () => {
      let widget = Array.from(app.shell.widgets('main')).find(
        w => w.id === 'jupyternaut-persona-settings'
      ) as AISettingsWidget | undefined;

      if (!widget) {
        widget = settingsWidget;
        app.shell.add(widget, 'main');
      }

      app.shell.activateById(widget.id);
    };

    if (restorer) {
      restorer.add(settingsWidget, settingsWidget.id);
    }

    app.commands.addCommand(CommandIds.openSettings, {
      label: trans.__('AI Settings'),
      caption: trans.__('Configure AI providers and behavior'),
      icon: settingsIcon,
      iconClass: 'jp-ai-settings-icon',
      execute: () => {
        open();
      },
      describedBy: {
        args: {}
      }
    });

    if (palette) {
      palette.addItem({
        command: CommandIds.openSettings,
        category: trans.__('AI Assistant')
      });
    }
  }
};

/**
 * Built-in completion providers plugin
 */
const settingsModel: JupyterFrontEndPlugin<IAISettingsModel> = {
  id: '@jupyternaut/persona:settings-model',
  description: 'Provide the AI settings model',
  autoStart: true,
  provides: IAISettingsModel,
  requires: [ISettingRegistry],
  activate: (
    app: JupyterFrontEnd,
    settingRegistry: ISettingRegistry
  ): IAISettingsModel => {
    return new AISettingsModel({ settingRegistry });
  }
};

/**
 * Diff manager plugin
 */
const diffManager: JupyterFrontEndPlugin<IDiffManager> = {
  id: '@jupyterlite/ai:diff-manager',
  description: 'Provide the diff manager for notebook cell diffs',
  autoStart: true,
  provides: IDiffManager,
  requires: [IAISettingsModel],
  activate: (
    app: JupyterFrontEnd,
    settingsModel: IAISettingsModel
  ): IDiffManager => {
    return new DiffManager({
      commands: app.commands,
      settingsModel
    });
  }
};

/**
 * Skill registry plugin
 */
const skillRegistryPlugin: JupyterFrontEndPlugin<ISkillRegistry> = {
  id: '@jupyternaut/persona:skill-registry',
  description: 'Provide the skill registry',
  autoStart: true,
  provides: ISkillRegistry,
  activate: () => {
    return new SkillRegistry();
  }
};

const toolRegistry: JupyterFrontEndPlugin<IToolRegistry> = {
  id: '@jupyternaut/persona:tool-registry',
  description: 'Provide the AI tool registry',
  autoStart: true,
  requires: [IAISettingsModel],
  optional: [ISkillRegistry],
  provides: IToolRegistry,
  activate: (
    app: JupyterFrontEnd,
    settingsModel: IAISettingsModel,
    skillRegistry?: ISkillRegistry
  ) => {
    const toolRegistry = new ToolRegistry();

    // Add command operation tools
    const discoverCommandsTool = createDiscoverCommandsTool(app.commands);
    const executeCommandTool = createExecuteCommandTool(
      app.commands,
      settingsModel
    );

    toolRegistry.add('discover_commands', discoverCommandsTool);
    toolRegistry.add('execute_command', executeCommandTool);
    toolRegistry.add('browser_fetch', createBrowserFetchTool());
    if (skillRegistry) {
      toolRegistry.add(
        'discover_skills',
        createDiscoverSkillsTool(skillRegistry)
      );
      toolRegistry.add('load_skill', createLoadSkillTool(skillRegistry));
    }

    return toolRegistry;
  }
};

const completionStatus: JupyterFrontEndPlugin<void> = {
  id: '@jupyternaut/persona:completion-status',
  description: 'The completion status displayed in the status bar',
  autoStart: true,
  requires: [IAISettingsModel],
  optional: [IStatusBar, ITranslator],
  activate: (
    app: JupyterFrontEnd,
    settingsModel: IAISettingsModel,
    statusBar: IStatusBar | null,
    translator?: ITranslator
  ) => {
    if (!statusBar) {
      return;
    }
    const trans = (translator ?? nullTranslator).load('jupyterlite_ai');
    const item = new CompletionStatusWidget({
      settingsModel,
      translator: trans
    });
    statusBar?.registerStatusItem('completionState', {
      item,
      align: 'right',
      rank: 10
    });
  }
};

/**
 * Skills plugin: discovers and registers agent skills from the filesystem.
 */
const skillsPlugin: JupyterFrontEndPlugin<void> = {
  id: '@jupyternaut/persona:skills',
  description: 'Discover and register agent skills',
  autoStart: true,
  requires: [IAISettingsModel, IDocumentManager, ISkillRegistry],
  optional: [ICommandPalette, ITranslator],
  activate: async (
    app: JupyterFrontEnd,
    settingsModel: IAISettingsModel,
    docManager: IDocumentManager,
    skillRegistry: ISkillRegistry,
    palette?: ICommandPalette,
    translator?: ITranslator
  ) => {
    const trans = (translator ?? nullTranslator).load('jupyterlite_ai');
    const validateResourcePath = (resourcePath: string): string | null => {
      if (resourcePath.startsWith('/')) {
        return null;
      }

      const normalized = PathExt.normalize(resourcePath);
      if (normalized.startsWith('..') || normalized === '') {
        return null;
      }

      return normalized;
    };

    let currentSkillsPaths = settingsModel.config.skillsPaths;
    let currentSkillDisposables = new DisposableSet();

    const loadAndRegister = async () => {
      const skillsPaths = settingsModel.config.skillsPaths;
      const skills = await loadSkillsFromPaths(
        docManager.services.contents,
        skillsPaths
      );

      const registrations = skills.map(skill => ({
        name: skill.name,
        description: skill.description,
        instructions: skill.instructions,
        resources: skill.resources,
        loadResource: async (resource: string) => {
          const validatedPath = validateResourcePath(resource);
          if (validatedPath === null) {
            return {
              name: skill.name,
              resource,
              error: 'Invalid resource path: path traversal not allowed'
            };
          }

          if (!skill.resources.includes(validatedPath)) {
            return {
              name: skill.name,
              resource,
              error: `Resource not found: ${resource}`
            };
          }

          const resourcePath = `${skill.path}/${validatedPath}`;
          try {
            const fileModel = await docManager.services.contents.get(
              resourcePath,
              {
                content: true
              }
            );
            if (typeof fileModel.content !== 'string') {
              return {
                name: skill.name,
                resource,
                error: 'Resource content is not a string'
              };
            }
            return {
              name: skill.name,
              resource,
              content: fileModel.content
            };
          } catch (error) {
            return {
              name: skill.name,
              resource,
              error: `Failed to read resource: ${error}`
            };
          }
        }
      }));

      currentSkillDisposables.dispose();
      currentSkillDisposables = new DisposableSet();
      for (const registration of registrations) {
        currentSkillDisposables.add(skillRegistry.registerSkill(registration));
      }
    };

    app.commands.addCommand(CommandIds.refreshSkills, {
      label: trans.__('Refresh Agents Skills'),
      caption: trans.__(
        'Re-scan the agents skills directory and update the registry'
      ),
      execute: async () => {
        await loadAndRegister();
      }
    });

    if (palette) {
      palette.addItem({
        command: CommandIds.refreshSkills,
        category: trans.__('AI Assistant')
      });
    }

    loadAndRegister().catch(error =>
      console.warn('Failed to load skills on activation:', error)
    );

    settingsModel.stateChanged.connect(() => {
      const newPaths = settingsModel.config.skillsPaths;
      if (
        newPaths.length === currentSkillsPaths.length &&
        newPaths.every((p, i) => p === currentSkillsPaths[i])
      ) {
        return;
      }
      currentSkillsPaths = newPaths;
      loadAndRegister().catch(error =>
        console.warn('Failed to reload skills:', error)
      );
    });
  }
};

export default [
  providerRegistryPlugin,
  anthropicProviderPlugin,
  googleProviderPlugin,
  mistralProviderPlugin,
  openaiProviderPlugin,
  genericProviderPlugin,
  settingsModel,
  diffManager,
  skillRegistryPlugin,
  personaHandlerRegistryPlugin,
  plugin,
  toolRegistry,
  agentManagerFactory,
  settingsPanelPlugin,
  completionStatus,
  skillsPlugin
];

// Export extension points for other extensions to use
export * from './tokens';
