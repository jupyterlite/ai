import { ChatCommand, IChatCommandProvider, IInputModel } from '@jupyter/chat';

export class SummarizeCommandProvider implements IChatCommandProvider {
  constructor(options: SummarizeCommandProvider.IOptions) {
    this._isDefault = options.isDefault;
    this._summarize = options.summarize;
  }

  public id: string = '@jupyternaut/persona:summarize';

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
    if (trimmed !== this._command.name) {
      return;
    }

    inputModel.value = '';
    inputModel.clearAttachments();
    inputModel.clearMentions();

    const chatName = inputModel.chatContext?.name;
    if (!chatName) {
      return;
    }

    await this._summarize(chatName);
  }

  private _isActive(inputModel: IInputModel): boolean {
    const chatName = inputModel.chatContext?.name;
    return !!chatName && this._isDefault(chatName);
  }

  private _command: ChatCommand = {
    name: '/summarize',
    providerId: this.id,
    description: 'Summarize the conversation history'
  };

  private _regex: RegExp = /^\/\w*$/;
  private _isDefault: (chatName: string) => boolean;
  private _summarize: (chatName: string) => Promise<void>;
}

export namespace SummarizeCommandProvider {
  export interface IOptions {
    isDefault: (chatName: string) => boolean;
    summarize: (chatName: string) => Promise<void>;
  }
}
