import { compileSchema, SchemaNode } from 'json-schema-library';
import { ReadableStream } from 'web-streams-polyfill';
// @ts-expect-error
globalThis.ReadableStream = ReadableStream;
// if (typeof global.ReadableStream === undefined) {
//   global.ReadableStream = ReadableStream;
// }

import { ChatAnthropic } from '@langchain/anthropic';
// import { ChatWebLLM } from '@langchain/community/chat_models/webllm';
import { ChromeAI } from '@langchain/community/experimental/llms/chrome_ai';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatMistralAI } from '@langchain/mistralai';
import { ChatOllama } from '@langchain/ollama';
import { ChatOpenAI } from '@langchain/openai';

// Import Settings
import AnthropicSettings from '../default-providers/Anthropic/settings-schema.json';
import ChromeAISettings from '../default-providers/ChromeAI/settings-schema.json';
import GeminiSettings from '../default-providers/Gemini/settings-schema.json';
import MistralAISettings from '../default-providers/MistralAI/settings-schema.json';
import OllamaAISettings from '../default-providers/Ollama/settings-schema.json';
import OpenAISettings from '../default-providers/OpenAI/settings-schema.json';
// import WebLLMSettings from '../default-providers/WebLLM/settings-schema.json';
import { IAIProvider, IType } from '../tokens';
import {
  BaseChatModel,
  BaseChatModelCallOptions
} from '@langchain/core/language_models/chat_models';
import { AIMessageChunk } from '@langchain/core/messages';

interface IAIProviderWithChat extends IAIProvider {
  chat: IType<BaseChatModel<BaseChatModelCallOptions, AIMessageChunk>>;
}
const AIProviders: IAIProviderWithChat[] = [
  {
    name: 'Anthropic',
    chat: ChatAnthropic,
    settingsSchema: AnthropicSettings
  },
  {
    name: 'ChromeAI',
    // TODO: fix
    // @ts-expect-error: missing properties
    chat: ChromeAI,
    settingsSchema: ChromeAISettings
  },
  {
    name: 'MistralAI',
    chat: ChatMistralAI,
    settingsSchema: MistralAISettings
  },
  {
    name: 'Ollama',
    chat: ChatOllama,
    settingsSchema: OllamaAISettings
  },
  {
    name: 'Gemini',
    chat: ChatGoogleGenerativeAI,
    settingsSchema: GeminiSettings
  },
  {
    name: 'OpenAI',
    chat: ChatOpenAI,
    settingsSchema: OpenAISettings
  }
  // {
  //   name: 'WebLLM',
  //   chat: ChatWebLLM,
  //   settingsSchema: WebLLMSettings
  // }
];

it('test provider settings', () => {
  AIProviders.forEach(provider => {
    console.log(`PROVIDER: ${provider.name}`);
    const schema: SchemaNode = compileSchema(provider.settingsSchema);
    const defaultSettings = schema.getData(undefined, {
      addOptionalProps: true
    });

    // Set a value for apiKey to avoid errors at instantiation.
    if (defaultSettings.apiKey !== undefined) {
      defaultSettings.apiKey = 'abc';
    }
    const model = new provider.chat(defaultSettings);

    Object.entries(defaultSettings).forEach(([key, value]) => {
      try {
        // @ts-expect-error
        expect(JSON.stringify(model[key])).toEqual(JSON.stringify(value));
      } catch (err) {
        // @ts-expect-error
        err.message = `${err.message}\nproperty: ${key}\n`;
        throw err; // throw the error so test fails as expected
      }
    });
  });
});
