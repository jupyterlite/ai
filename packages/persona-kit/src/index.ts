// Persona kit public API

import plugins from './plugins';

export {
  CommandIds,
  IPersonaKitSettings,
  ISkillRegistry,
  IToolRegistry,
  KIT_SETTINGS_ID
} from './tokens';
export type {
  INamedTool,
  IPersonaKitConfig,
  ITool,
  IToolCallOptions,
  ToolMap
} from './tokens';
export { getAppAttribution } from './app-attribution';
export { forwardAuthCode, requestApiKey } from './oauth/openrouter';
export { ToolRegistry } from './tools/tool-registry';
export {
  createDiscoverCommandsTool,
  createExecuteCommandApprovalPolicy,
  createExecuteCommandTool
} from './tools/commands';
export { createDiscoverSkillsTool, createLoadSkillTool } from './tools/skills';
export { extractMimeBundles } from './tools/mime-bundles';
export { getToolInputSchema, parseToolInput } from './tools/tool-input';
export { createBrowserFetchTool } from './tools/web';
export {
  loadSkillsFromPaths,
  SkillRegistry,
  type ISkillDefinition,
  type ISkillRegistration,
  type ISkillResourceResult,
  type ISkillSummary
} from './skills';

export default plugins;
