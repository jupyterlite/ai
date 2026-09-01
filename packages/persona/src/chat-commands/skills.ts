import { ChatCommand, IChatCommandProvider, IInputModel } from '@jupyter/chat';
import type { ISkillRegistry } from '@jupyternaut/agent';
import { CommandRegistry } from '@lumino/commands';

import { CommandIds, PERSONA_ID } from '../tokens';

export class SkillsCommandProvider implements IChatCommandProvider {
  constructor(options: SkillsCommandProvider.IOptions) {
    this._skillRegistry = options.skillRegistry;
    this._commands = options.commands;
    this._sendSystemMessage = options.sendSystemMessage;
    this._isDefault = options.isDefault;
  }

  public id: string = '@jupyternaut/persona:skills-command';

  async listCommandCompletions(
    inputModel: IInputModel
  ): Promise<ChatCommand[]> {
    if (!this._isActive(inputModel)) {
      return [];
    }

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
    if (!this._isActive(inputModel)) {
      return;
    }

    const trimmed = inputModel.value.trim();
    const match = trimmed.match(/^\/skills(?:\s+(.+))?$/);
    if (!match) {
      return;
    }

    if (this._commands.hasCommand(CommandIds.refreshSkills)) {
      await this._commands.execute(CommandIds.refreshSkills);
    }

    const query = match[1]?.trim();
    const filtered = this._skillRegistry.listSkills(query);

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

    const chatName = inputModel.chatContext?.name;
    if (chatName) {
      this._sendSystemMessage(chatName, body);
    }

    // Prevent the message to be actually sent.
    inputModel.value = '';
    inputModel.clearAttachments();
    inputModel.clearMentions();
  }

  private _isActive(inputModel: IInputModel): boolean {
    const metaPersonaId = (inputModel.getMetadata() as any).to_persona;
    const chatName = inputModel.chatContext?.name;
    return (
      metaPersonaId === PERSONA_ID || (!!chatName && this._isDefault(chatName))
    );
  }

  private _command: ChatCommand = {
    name: '/skills',
    providerId: this.id,
    description: 'List available skills'
  };

  private _regex: RegExp = /^\/\w*$/;
  private _commands: CommandRegistry;
  private _skillRegistry: ISkillRegistry;
  private _sendSystemMessage: (chatName: string, body: string) => void;
  private _isDefault: (chatName: string) => boolean;
}

export namespace SkillsCommandProvider {
  export interface IOptions {
    skillRegistry: ISkillRegistry;
    commands: CommandRegistry;
    sendSystemMessage: (chatName: string, body: string) => void;
    isDefault: (chatName: string) => boolean;
  }
}
