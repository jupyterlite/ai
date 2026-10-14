import { Token } from '@lumino/coreutils';
import type { IDisposable } from '@lumino/disposable';
import { ISignal } from '@lumino/signaling';

import type {
  ISkillDefinition,
  ISkillRegistration,
  ISkillResourceResult,
  ISkillSummary
} from './skills';

/* THE TOOL REGISTRY */
/**
 * The options a tool call receives, a subset of the AI SDK tool call options.
 */
export interface IToolCallOptions {
  toolCallId: string;
  messages?: unknown[];
  abortSignal?: AbortSignal;
  context?: unknown;
}

/**
 * A tool a persona offers to a model. AI SDK tool objects have this shape, so
 * they register unchanged. The input schema is a zod schema or an AI SDK JSON
 * schema object: see `getToolInputSchema` and `parseToolInput`.
 */
export interface ITool<TInput = any, TOutput = unknown> {
  description?: string | ((options: { context: unknown }) => string);
  inputSchema: unknown;
  execute?(
    input: TInput,
    options: IToolCallOptions
  ): AsyncIterable<TOutput> | PromiseLike<TOutput> | TOutput;
  metadata?: Record<string, unknown>;
}

/**
 * A map containing tools.
 */
export type ToolMap = Record<string, ITool>;

/**
 * Interface for a named tool (tool with a name identifier)
 */
export interface INamedTool {
  /**
   * The unique name of the tool
   */
  name: string;
  /**
   * The tool instance
   */
  tool: ITool;
}

/**
 * The tool registry interface for managing AI tools
 */
export interface IToolRegistry {
  /**
   * The registered tools as a record (name -> tool mapping).
   */
  readonly tools: Record<string, ITool>;

  /**
   * The registered named tools array.
   */
  readonly namedTools: INamedTool[];

  /**
   * A signal triggered when the tools have changed.
   */
  readonly toolsChanged: ISignal<IToolRegistry, void>;

  /**
   * Add a new tool to the registry.
   */
  add(name: string, tool: ITool): void;

  /**
   * Get a tool for a given name.
   * Return null if the name is not provided or if there is no registered tool with the
   * given name.
   */
  get(name: string | null): ITool | null;

  /**
   * Remove a tool from the registry by name.
   */
  remove(name: string): boolean;
}

/**
 * The tool registry token.
 */
export const IToolRegistry = new Token<IToolRegistry>(
  '@jupyter-ai/persona-kit:IToolRegistry',
  'Tool registry for AI agent functionality'
);

/* THE SKILL REGISTRY */

/**
 * Registry for skills available to the AI agent.
 */
export interface ISkillRegistry {
  /**
   * Signal emitted when skills change.
   */
  readonly skillsChanged: ISignal<ISkillRegistry, void>;

  /**
   * Register a single skill.
   */
  registerSkill(skill: ISkillRegistration): IDisposable;

  /**
   * List all skills with summary info, optionally filtered by a search query.
   */
  listSkills(query?: string): ISkillSummary[];

  /**
   * Get a full skill definition by name.
   */
  getSkill(name: string): ISkillDefinition | null;

  /**
   * Load a resource for a skill.
   */
  getSkillResource(
    name: string,
    resource: string
  ): Promise<ISkillResourceResult>;
}

/**
 * The skill registry token.
 */
export const ISkillRegistry = new Token<ISkillRegistry>(
  '@jupyter-ai/persona-kit:ISkillRegistry',
  'Skill registry for AI agent functionality'
);

/* THE SETTINGS */

/**
 * The settings shared by the in-browser personas.
 */
export interface IPersonaKitConfig {
  /**
   * The JupyterLab commands that need the approval of the user before a
   * persona runs them.
   */
  commandsRequiringApproval: string[];
  /**
   * The commands whose `execute_command` outputs may render MIME bundles in
   * the chat.
   */
  commandsAutoRenderMimeBundles: string[];
  /**
   * The MIME types marked as trusted when command outputs render in the chat.
   */
  trustedMimeTypesForAutoRender: string[];
  /**
   * The directories that hold agent skills, relative to the server root.
   */
  skillsPaths: string[];
}

/**
 * The settings model of the persona kit.
 */
export interface IPersonaKitSettings {
  /**
   * The current settings, with the defaults applied.
   */
  readonly config: IPersonaKitConfig;
  /**
   * A signal emitted when the settings change.
   */
  readonly changed: ISignal<IPersonaKitSettings, void>;
  /**
   * A promise that resolves once the settings are loaded.
   */
  readonly ready: Promise<void>;
  /**
   * Save new values for some settings.
   */
  update(updates: Partial<IPersonaKitConfig>): Promise<void>;
}

/**
 * The persona kit settings token.
 */
export const IPersonaKitSettings = new Token<IPersonaKitSettings>(
  '@jupyter-ai/persona-kit:IPersonaKitSettings',
  'Settings shared by the in-browser personas'
);

/**
 * The id of the persona kit settings plugin, which is also the settings id.
 */
export const KIT_SETTINGS_ID = '@jupyter-ai/persona-kit:settings';

/**
 * The commands of the persona kit.
 */
export namespace CommandIds {
  export const refreshSkills = '@jupyter-ai/persona-kit:refresh-skills';
}
