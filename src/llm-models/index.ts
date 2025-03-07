import { ChatAnthropic } from '@langchain/anthropic';
import { ChromeAI } from '@langchain/community/experimental/llms/chrome_ai';
import { ChatMistralAI } from '@langchain/mistralai';
import { ChatOpenAI } from '@langchain/openai';

import { AnthropicCompleter } from './anthropic-completer';
import { CodestralCompleter } from './codestral-completer';
import { ChromeCompleter } from './chrome-completer';
import { OpenAICompleter } from './openai-completer';

import { instructions } from '../settings/instructions';
import { ProviderSettings } from '../settings/schemas';

import { IAIProvider } from '../token';

export * from './base-completer';

const AIProviders: IAIProvider[] = [
  {
    name: 'Anthropic',
    chatModel: ChatAnthropic,
    completer: AnthropicCompleter,
    settings: ProviderSettings.Anthropic,
    errorMessage: (error: any) => error.error.error.message
  },
  {
    name: 'ChromeAI',
    // TODO: fix
    // @ts-expect-error: missing properties
    chatModel: ChromeAI,
    completer: ChromeCompleter,
    instructions: instructions.ChromeAI,
    settings: ProviderSettings.ChromeAI
  },
  {
    name: 'MistralAI',
    chatModel: ChatMistralAI,
    completer: CodestralCompleter,
    instructions: instructions.MistralAI,
    settings: ProviderSettings.MistralAI
  },
  {
    name: 'OpenAI',
    chatModel: ChatOpenAI,
    completer: OpenAICompleter,
    settings: ProviderSettings.OpenAI
  }
];

export { AIProviders };
