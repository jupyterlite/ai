import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChromeAI } from '@langchain/community/experimental/llms/chrome_ai';
import { ChatMistralAI } from '@langchain/mistralai';
import { ChatOpenAI } from '@langchain/openai';

import { IAIProvider, IAIProviderRegistry } from '../tokens';

// Import completers
import { AnthropicCompleter } from './Anthropic/completer';
import { ChromeCompleter } from './ChromeAI/completer';
import { CodestralCompleter } from './MistralAI/completer';
import { OpenAICompleter } from './OpenAI/completer';

// Import Settings
import AnthropicSettings from './Anthropic/settings-schema.json';
import ChromeAISettings from './ChromeAI/settings-schema.json';
import MistralAISettings from './MistralAI/settings-schema.json';
import OpenAISettings from './OpenAI/settings-schema.json';

// Import instructions
import ChromeAIInstructions from './ChromeAI/instructions';
import MistralAIInstructions from './MistralAI/instructions';

// Build the AIProvider list
const AIProviders: IAIProvider[] = [
  {
    name: 'Anthropic',
    chatModel: ChatAnthropic,
    completer: AnthropicCompleter,
    settingsSchema: AnthropicSettings,
    errorMessage: (error: any) => error.error.error.message
  },
  {
    name: 'ChromeAI',
    // TODO: fix
    // @ts-expect-error: missing properties
    chatModel: ChromeAI,
    completer: ChromeCompleter,
    instructions: ChromeAIInstructions,
    settingsSchema: ChromeAISettings
  },
  {
    name: 'MistralAI',
    chatModel: ChatMistralAI,
    completer: CodestralCompleter,
    instructions: MistralAIInstructions,
    settingsSchema: MistralAISettings
  },
  {
    name: 'OpenAI',
    chatModel: ChatOpenAI,
    completer: OpenAICompleter,
    settingsSchema: OpenAISettings
  }
];

export const defaultProviderPlugins: JupyterFrontEndPlugin<void>[] =
  AIProviders.map(provider => {
    return {
      id: `@jupyterlite/ai:${provider.name}`,
      autoStart: true,
      requires: [IAIProviderRegistry],
      activate: (app: JupyterFrontEnd, registry: IAIProviderRegistry) => {
        registry.add(provider);
      }
    };
  });
