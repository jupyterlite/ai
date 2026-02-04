import { JupyterFrontEndPlugin } from '@jupyterlab/application';

import {
  ChatCommand,
  IChatCommandProvider,
  IChatCommandRegistry,
  IInputModel
} from '@jupyter/chat';

import { AIChatModel } from '../chat-model';

export class ClearCommandProvider implements IChatCommandProvider {
  public id: string = '@jupyterlite/ai:clear-command';

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
    if (trimmed !== this._command.name) {
      return;
    }

    const context = inputModel.chatContext as
      | AIChatModel.IAIChatContext
      | undefined;
    context?.clearMessages?.();

    inputModel.value = '';
    inputModel.clearAttachments();
    inputModel.clearMentions();
  }

  private _command: ChatCommand = {
    name: '/clear',
    providerId: this.id,
    description: 'Clear the current chat history'
  };

  private _regex: RegExp = /^\/\w*$/;
}

export const clearCommandPlugin: JupyterFrontEndPlugin<void> = {
  id: '@jupyterlite/ai:clear-command',
  description: 'Register the /clear chat command.',
  autoStart: true,
  requires: [IChatCommandRegistry],
  activate: (app, registry: IChatCommandRegistry) => {
    registry.addProvider(new ClearCommandProvider());
  }
};
