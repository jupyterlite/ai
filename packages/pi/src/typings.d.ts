/**
 * pi modules that the package exports map hides; the build aliases
 * `pi-coding-agent-package` to the package folder.
 */
declare module 'pi-coding-agent-package/dist/core/model-resolver.js' {
  import type {
    Api,
    Model,
    ModelThinkingLevel as ThinkingLevel
  } from '@earendil-works/pi-ai';
  import type { ModelRuntime } from '@earendil-works/pi-coding-agent';

  export function findInitialModel(options: {
    scopedModels: [];
    isContinuing: boolean;
    defaultProvider?: string;
    defaultModelId?: string;
    defaultThinkingLevel?: ThinkingLevel;
    modelThinkingLevels?: Record<string, ThinkingLevel>;
    modelRuntime: ModelRuntime;
  }): Promise<{ model: Model<Api> | undefined; thinkingLevel: ThinkingLevel }>;
}

declare module 'pi-coding-agent-package/dist/core/project-trust.js' {
  import type {
    DefaultProjectTrust,
    ProjectTrustContext,
    ProjectTrustStore
  } from '@earendil-works/pi-coding-agent';

  export function resolveProjectTrusted(options: {
    cwd: string;
    trustStore: ProjectTrustStore;
    trustOverride?: boolean;
    defaultProjectTrust?: DefaultProjectTrust;
    projectTrustContext: ProjectTrustContext;
  }): Promise<boolean>;
}

declare module 'pi-coding-agent-package/dist/core/settings-diagnostics.js' {
  import type { SettingsManager } from '@earendil-works/pi-coding-agent';

  export function collectSettingsDiagnostics(
    settingsManager: SettingsManager
  ): { type: 'warning'; message: string }[];
}

declare module 'pi-coding-agent-package/dist/core/slash-commands.js' {
  export const BUILTIN_SLASH_COMMANDS: ReadonlyArray<{
    name: string;
    description: string;
  }>;
}

declare module 'pi-coding-agent-package/dist/core/tools/path-utils.js' {
  export function resolveToCwd(filePath: string, cwd: string): string;
}

declare module 'pi-coding-agent-package/dist/core/settings-manager.js' {
  export function isToolModifier(entry: unknown): entry is string;
  export function applyToolModifiers(
    base: string[],
    entries: string[]
  ): string[];
}

declare module 'pi-coding-agent-package/dist/utils/json.js' {
  export function stripJsonComments(input: string): string;
}
