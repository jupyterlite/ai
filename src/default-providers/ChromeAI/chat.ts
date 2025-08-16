import {
  BaseChatModel,
  BaseChatModelCallOptions
} from '@langchain/core/language_models/chat_models';
import {
  AIMessageChunk,
  BaseMessage,
  AIMessage
} from '@langchain/core/messages';
import { ChromeAI as ChromeLLM } from '@langchain/community/experimental/llms/chrome_ai';
import { CallbackManagerForLLMRun } from '@langchain/core/callbacks/manager';
import { ChatResult, ChatGeneration } from '@langchain/core/outputs';

export interface IChromeChatCallOptions extends BaseChatModelCallOptions {}

export class ChromeChatModel extends BaseChatModel<
  IChromeChatCallOptions,
  AIMessageChunk
> {
  private llm: ChromeLLM;

  constructor(fields?: ConstructorParameters<typeof ChromeLLM>[0]) {
    super(fields ?? {});
    this.llm = new ChromeLLM(fields ?? {});
  }

  _llmType() {
    return 'chrome-chat';
  }

  async _generate(
    messages: BaseMessage[],
    options: IChromeChatCallOptions,
    runManager?: CallbackManagerForLLMRun
  ): Promise<ChatResult> {
    const text = messages.map(m => m.content).join('\n');
    const completion = await this.llm.invoke(text, options);

    const generations: ChatGeneration[] = [
      {
        text: completion,
        message: new AIMessage(completion)
      }
    ];

    return { generations };
  }
}
