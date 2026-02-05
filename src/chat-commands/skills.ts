import { ChatCommand, IChatCommandProvider, IInputModel } from '@jupyter/chat';

import { AIChatModel } from '../chat-model';
import { ISkillRegistry } from '../tokens';

export class SkillsCommandProvider implements IChatCommandProvider {
  constructor(skillRegistry: ISkillRegistry) {
    this._skillRegistry = skillRegistry;
  }

  public id: string = '@jupyterlite/ai:skills-command';

  async listCommandCompletions(
    inputModel: IInputModel
  ): Promise<ChatCommand[]> {
    const match = inputModel.currentWord?.match(this._regex)?.[0];
    if (!match) {
      return [];
    }

    if (this._command.name.startsWith(match)) {
      return [this._command];
    }

    return [];
  }

  async onSubmit(inputModel: IInputModel): Promise<void> {
    const trimmed = inputModel.value.trim();
    const match = trimmed.match(/^\/skills(?:\s+(.+))?$/);
    if (!match) {
      return;
    }

    const query = match[1]?.trim();
    const skills = this._skillRegistry.listSkills();
    const filtered = query
      ? skills.filter(skill => {
          const term = query.toLowerCase();
          return (
            skill.name.toLowerCase().includes(term) ||
            skill.description.toLowerCase().includes(term)
          );
        })
      : skills;

    let body = '';
    if (filtered.length === 0) {
      body = query
        ? `No skills found matching "${query}".`
        : 'No skills are currently registered.';
    } else {
      const heading = query
        ? `Skills matching "${query}" (${filtered.length}):`
        : `Available skills (${filtered.length}):`;
      const lines = filtered.map(
        skill => `- \`${skill.name}\` — ${skill.description}`
      );
      body = [heading, '', ...lines].join('\n');
    }

    const context = inputModel.chatContext as
      | AIChatModel.IAIChatContext
      | undefined;
    context?.addSystemMessage?.(body);

    inputModel.value = '';
    inputModel.clearAttachments();
    inputModel.clearMentions();
  }

  private _command: ChatCommand = {
    name: '/skills',
    providerId: this.id,
    description: 'List available skills'
  };

  private _regex: RegExp = /^\/\w*$/;
  private _skillRegistry: ISkillRegistry;
}
