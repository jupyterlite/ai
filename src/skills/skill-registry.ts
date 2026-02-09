/*
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */

import { DisposableDelegate } from '@lumino/disposable';
import { ISignal, Signal } from '@lumino/signaling';

import {
  ISkillDefinition,
  ISkillRegistration,
  ISkillResourceResult,
  ISkillSummary
} from './types';
import { ISkillRegistry } from '../tokens';

interface ISkillEntry {
  definition: ISkillDefinition;
  loadResource?: (resource: string) => Promise<ISkillResourceResult>;
  registrationId: number;
}

export class SkillRegistry implements ISkillRegistry {
  /**
   * Signal emitted when skills change.
   */
  get skillsChanged(): ISignal<ISkillRegistry, void> {
    return this._skillsChanged;
  }

  /**
   * Register a single skill.
   */
  registerSkill(skill: ISkillRegistration): DisposableDelegate {
    const entry = this._registerSkillInternal(skill);
    if (!entry) {
      return new DisposableDelegate(() => undefined);
    }

    this._skillsChanged.emit(void 0);

    const registrationId = entry.registrationId;
    const name = skill.name;
    return new DisposableDelegate(() => {
      const current = this._skills.get(name);
      if (!current || current.registrationId !== registrationId) {
        return;
      }

      this._skills.delete(name);
      this._skillsChanged.emit(void 0);
    });
  }

  /**
   * List all registered skills with summary info, optionally filtered by a
   * search query (matches name or description, case-insensitive).
   */
  listSkills(query?: string): ISkillSummary[] {
    const summaries: ISkillSummary[] = [];
    for (const entry of this._skills.values()) {
      summaries.push({
        name: entry.definition.name,
        description: entry.definition.description
      });
    }
    summaries.sort((a, b) => a.name.localeCompare(b.name));

    if (!query) {
      return summaries;
    }
    const term = query.toLowerCase();
    return summaries.filter(
      skill =>
        skill.name.toLowerCase().includes(term) ||
        skill.description.toLowerCase().includes(term)
    );
  }

  /**
   * Get the full definition for a skill.
   */
  getSkill(name: string): ISkillDefinition | null {
    const entry = this._skills.get(name);
    return entry ? entry.definition : null;
  }

  /**
   * Load a resource for a skill.
   */
  async getSkillResource(
    name: string,
    resource: string
  ): Promise<ISkillResourceResult> {
    const entry = this._skills.get(name);
    if (!entry) {
      return {
        name,
        resource,
        error: `Skill not found: ${name}`
      };
    }

    if (!entry.loadResource) {
      return {
        name,
        resource,
        error: `Skill does not provide resources: ${name}`
      };
    }

    return entry.loadResource(resource);
  }

  private _registerSkillInternal(
    skill: ISkillRegistration
  ): ISkillEntry | null {
    const existing = this._skills.get(skill.name);
    if (existing) {
      console.warn(`Skipping duplicate skill name "${skill.name}".`);
      return null;
    }

    const { loadResource, ...definition } = skill;
    const entry: ISkillEntry = {
      definition,
      loadResource,
      registrationId: this._nextRegistrationId++
    };
    this._skills.set(skill.name, entry);
    return entry;
  }

  private _skills = new Map<string, ISkillEntry>();
  private _skillsChanged = new Signal<ISkillRegistry, void>(this);
  private _nextRegistrationId = 0;
}
