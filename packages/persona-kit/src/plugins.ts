/*
 * The plugins provide the registries and the settings at activation, so their
 * modules load with the application either way.
 */
/* eslint-disable jupyter/prefer-lazy-imports */
import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import { ICommandPalette } from '@jupyterlab/apputils';
import { PathExt } from '@jupyterlab/coreutils';
import { IDocumentManager } from '@jupyterlab/docmanager';
import { ISettingRegistry } from '@jupyterlab/settingregistry';
import { ITranslator, nullTranslator } from '@jupyterlab/translation';
import { DisposableSet } from '@lumino/disposable';

import { forwardAuthCode } from './oauth/openrouter';
import { PersonaKitSettings } from './settings';
import { loadSkillsFromPaths, SkillRegistry } from './skills';
import {
  CommandIds,
  IPersonaKitSettings,
  ISkillRegistry,
  IToolRegistry,
  KIT_SETTINGS_ID
} from './tokens';
import {
  createDiscoverCommandsTool,
  createExecuteCommandTool
} from './tools/commands';
import { createDiscoverSkillsTool, createLoadSkillTool } from './tools/skills';
import { ToolRegistry } from './tools/tool-registry';
import { createBrowserFetchTool } from './tools/web';

/**
 * The settings shared by the in-browser personas.
 */
const settingsPlugin: JupyterFrontEndPlugin<IPersonaKitSettings> = {
  id: KIT_SETTINGS_ID,
  description: 'Provide the settings shared by the in-browser personas',
  autoStart: true,
  provides: IPersonaKitSettings,
  requires: [ISettingRegistry],
  activate: (
    app: JupyterFrontEnd,
    settingRegistry: ISettingRegistry
  ): IPersonaKitSettings => {
    return new PersonaKitSettings({ settingRegistry });
  }
};

/**
 * The "Connect with OpenRouter" flow runs in a popup window, which loads the
 * application again when OpenRouter redirects back. In that window, send the
 * authorization code to the main window.
 */
const openrouterAuthPlugin: JupyterFrontEndPlugin<void> = {
  id: '@jupyter-ai/persona-kit:openrouter-auth',
  description: 'Complete the OpenRouter authorization in the popup window',
  autoStart: true,
  activate: (): void => {
    forwardAuthCode();
  }
};

/**
 * Skill registry plugin
 */
const skillRegistryPlugin: JupyterFrontEndPlugin<ISkillRegistry> = {
  id: '@jupyter-ai/persona-kit:skill-registry',
  description: 'Provide the skill registry',
  autoStart: true,
  provides: ISkillRegistry,
  activate: () => {
    return new SkillRegistry();
  }
};

/**
 * Tool registry plugin
 */
const toolRegistry: JupyterFrontEndPlugin<IToolRegistry> = {
  id: '@jupyter-ai/persona-kit:tool-registry',
  description: 'Provide the AI tool registry',
  autoStart: true,
  optional: [ISkillRegistry, ITranslator],
  provides: IToolRegistry,
  activate: (
    app: JupyterFrontEnd,
    skillRegistry?: ISkillRegistry,
    translator?: ITranslator
  ) => {
    const toolRegistry = new ToolRegistry();

    // Add command operation tools
    const discoverCommandsTool = createDiscoverCommandsTool(
      app.commands,
      translator
    );
    const executeCommandTool = createExecuteCommandTool(
      app.commands,
      translator
    );

    toolRegistry.add('discover_commands', discoverCommandsTool);
    toolRegistry.add('execute_command', executeCommandTool);
    toolRegistry.add('browser_fetch', createBrowserFetchTool(translator));
    if (skillRegistry) {
      toolRegistry.add(
        'discover_skills',
        createDiscoverSkillsTool(skillRegistry, translator)
      );
      toolRegistry.add(
        'load_skill',
        createLoadSkillTool(skillRegistry, translator)
      );
    }

    return toolRegistry;
  }
};

/**
 * Skills plugin: discovers and registers agent skills from the filesystem.
 */
const skillsPlugin: JupyterFrontEndPlugin<void> = {
  id: '@jupyter-ai/persona-kit:skills',
  description: 'Discover and register agent skills',
  autoStart: true,
  requires: [IPersonaKitSettings, IDocumentManager, ISkillRegistry],
  optional: [ICommandPalette, ITranslator],
  activate: async (
    app: JupyterFrontEnd,
    settings: IPersonaKitSettings,
    docManager: IDocumentManager,
    skillRegistry: ISkillRegistry,
    palette?: ICommandPalette,
    translator?: ITranslator
  ) => {
    const trans = (translator ?? nullTranslator).load('jupyter_ai_persona_kit');
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

    let currentSkillsPaths = settings.config.skillsPaths;
    let currentSkillDisposables = new DisposableSet();

    const loadAndRegister = async () => {
      const skillsPaths = settings.config.skillsPaths;
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
      },
      describedBy: {
        args: {}
      }
    });

    if (palette) {
      palette.addItem({
        command: CommandIds.refreshSkills,
        category: trans.__('AI Assistant')
      });
    }

    await settings.ready;
    loadAndRegister().catch(error =>
      console.warn('Failed to load skills on activation:', error)
    );

    settings.changed.connect(() => {
      const newPaths = settings.config.skillsPaths;
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
  settingsPlugin,
  openrouterAuthPlugin,
  skillRegistryPlugin,
  skillsPlugin,
  toolRegistry
];
