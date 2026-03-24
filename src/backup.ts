import type { IMessageContent, IUser } from '@jupyter/chat';
import { PathExt } from '@jupyterlab/coreutils';
import { Contents } from '@jupyterlab/services';

import { AIChatModel } from './chat-model';
import { IAISettingsModel } from './tokens';

type ExportedChat = {
  provider: string;
  messages: IMessageContent<string>[];
  users: { [id: string]: IUser };
};

export async function saveChat(
  contentsManager: Contents.IManager,
  model: AIChatModel
) {
  const directory = '.chats-backup';
  const filepath = PathExt.join(directory, `${model.name}.json`);
  const content = JSON.stringify(Private.serializeModel(model));
  await contentsManager.get(filepath, { content: false }).catch(async () => {
    await contentsManager.get(directory, { content: false }).catch(async () => {
      const dir = await contentsManager.newUntitled({ type: 'directory' });
      await contentsManager.rename(dir.path, directory);
    });
    const file = await contentsManager.newUntitled({ ext: '.json' });
    await contentsManager.rename(file.path, filepath);
  });
  await contentsManager.save(filepath, {
    content,
    type: 'file',
    format: 'text'
  });
}

export async function restoreChat(
  contentsManager: Contents.IManager,
  model: AIChatModel,
  settingsModel: IAISettingsModel
): Promise<boolean> {
  const directory = '.chats-backup';
  const filepath = PathExt.join(directory, `${model.name}.json`);
  const contentModel = await contentsManager.get(filepath).catch(() => {
    console.log(`There is no backup for chat '${model.name}'`);
    return;
  });
  if (!contentModel) {
    return false;
  }
  const content = JSON.parse(contentModel.content) as ExportedChat;
  if (settingsModel.getProvider(content.provider)) {
    model.agentManager.activeProvider = content.provider;
  } else {
    console.log(
      `'${content.provider}' is not an existing provider and can't be restored.`
    );
  }
  const messages: IMessageContent[] = content.messages.map(message => ({
    ...message,
    sender: content.users[message.sender] ?? { username: 'unknown' },
    mentions: message.mentions?.map(mention => content.users[mention])
  }));
  model.clearMessages();
  model.messagesInserted(0, messages);
  return true;
}

export namespace Private {
  export const serializeModel = (model: AIChatModel): ExportedChat => {
    const provider = model.agentManager.activeProvider;
    const messages: IMessageContent<string>[] = [];
    const users: { [id: string]: IUser } = {};
    model.messages.forEach(message => {
      messages.push({
        ...message.content,
        sender: message.sender.username,
        mentions: message.mentions?.map(user => user.username)
      });
      if (!users[message.sender.username]) {
        users[message.sender.username] = message.sender;
      }
    });
    return {
      provider,
      messages,
      users
    };
  };
}
