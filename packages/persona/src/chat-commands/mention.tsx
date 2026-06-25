import {
  Avatar,
  ChatCommand,
  IChatCommandProvider,
  IInputModel
} from '@jupyter/chat';

import { DEFAULT_PERSONA } from '../tokens';

export class MentionCommandProvider implements IChatCommandProvider {
  public id: string = '@jupyternaut/persona:mention';

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
    const input = inputModel.value;
    const match = input.match(this._regex)?.[0];
    if (this._command.name === match) {
      inputModel.addMention?.(DEFAULT_PERSONA);
    }
  }

  private _command: ChatCommand = {
    name: `@${DEFAULT_PERSONA.mention_name}`,
    providerId: this.id,
    icon: <Avatar user={DEFAULT_PERSONA} />,
    spaceOnAccept: true
  };

  private _regex: RegExp = /@([\w-]*)/g;
}
