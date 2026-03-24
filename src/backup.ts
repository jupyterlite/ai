import type { IMessageContent } from '@jupyter/chat';
import { PathExt } from '@jupyterlab/coreutils';
import { Contents } from '@jupyterlab/services';
import { Debouncer } from '@lumino/polling';

import { AIChatModel } from './chat-model';

export function saveChat(
  contentsManager: Contents.IManager,
  provider: string,
  model: AIChatModel
) {
  Private.saveChatThrottler.invoke(contentsManager, provider, model);
}

export namespace Private {
  const serializeModel = (model: AIChatModel) => {
    const provider = model.agentManager.activeProvider;
    const messages: IMessageContent[] = model.messages.map(message => {
      return {
        ...message.content,
        sender: { username: message.sender.username }
      };
    });
    return {
      provider,
      messages
    };
  };

  /**
   * Save the chat in a file.
   */
  const _saveChat = async (
    contentsManager: Contents.IManager,
    provider: string,
    model: AIChatModel
  ) => {
    const directory = '.chats-backup';
    const filepath = PathExt.join(directory, `${model.name}.json`);
    const content = JSON.stringify(serializeModel(model));
    await contentsManager.get(filepath, { content: false }).catch(async () => {
      await contentsManager
        .get(directory, { content: false })
        .catch(async () => {
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
  };

  export const saveChatThrottler = new Debouncer(_saveChat, 3000);
}
