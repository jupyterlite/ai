import {
  Avatar,
  ChatCommand,
  IChatCommandProvider,
  IInputModel
} from '@jupyter/chat';

import { PERSONA, PERSONA_MENTION } from '../tokens';

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
      inputModel.addMention?.(PERSONA);
    }
  }

  private _command: ChatCommand = {
    name: PERSONA_MENTION,
    providerId: this.id,
    icon: <Avatar user={PERSONA} />,
    spaceOnAccept: true
  };

  private _regex: RegExp = /@([\w-]*)/g;
}
