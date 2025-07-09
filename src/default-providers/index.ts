import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import { Notification } from '@jupyterlab/apputils';

import { ChatAnthropic } from '@langchain/anthropic';
import { ChatWebLLM } from '@langchain/community/chat_models/webllm';
import { ChromeAI } from '@langchain/community/experimental/llms/chrome_ai';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatMistralAI } from '@langchain/mistralai';
import { ChatOllama } from '@langchain/ollama';
import { ChatOpenAI } from '@langchain/openai';

// Import completers
import { AnthropicCompleter } from './Anthropic/completer';
import { ChromeCompleter } from './ChromeAI/completer';
import { GeminiCompleter } from './Gemini/completer';
import { CodestralCompleter } from './MistralAI/completer';
import { OllamaCompleter } from './Ollama/completer';
import { OpenAICompleter } from './OpenAI/completer';
import { WebLLMCompleter } from './WebLLM/completer';

// Import Settings
import AnthropicSettings from './Anthropic/settings-schema.json';
import ChromeAISettings from './ChromeAI/settings-schema.json';
import GeminiSettings from './Gemini/settings-schema.json';
import MistralAISettings from './MistralAI/settings-schema.json';
import OllamaAISettings from './Ollama/settings-schema.json';
import OpenAISettings from './OpenAI/settings-schema.json';
import WebLLMSettings from './WebLLM/settings-schema.json';

// Import instructions
import ChromeAIInstructions, {
  compatibilityCheck as chromeAICompatibilityCheck
} from './ChromeAI/instructions';
import GeminiInstructions from './Gemini/instructions';
import MistralAIInstructions from './MistralAI/instructions';
import OllamaInstructions from './Ollama/instructions';
import WebLLMInstructions, {
  compatibilityCheck as webLLMCompatibilityCheck
} from './WebLLM/instructions';

import { prebuiltAppConfig } from '@mlc-ai/web-llm';

import { IAIProvider, IAIProviderRegistry } from '../tokens';

// Build the AIProvider list
const AIProviders: IAIProvider[] = [
  {
    name: 'Anthropic',
    chat: ChatAnthropic,
    completer: AnthropicCompleter,
    settingsSchema: AnthropicSettings,
    errorMessage: (error: any) => error.error.error.message
  },
  {
    name: 'ChromeAI',
    // TODO: fix
    // @ts-expect-error: missing properties
    chat: ChromeAI,
    completer: ChromeCompleter,
    instructions: ChromeAIInstructions,
    settingsSchema: ChromeAISettings,
    compatibilityCheck: chromeAICompatibilityCheck
  },
  {
    name: 'MistralAI',
    chat: ChatMistralAI,
    completer: CodestralCompleter,
    instructions: MistralAIInstructions,
    settingsSchema: MistralAISettings
  },
  {
    name: 'Ollama',
    chat: ChatOllama,
    completer: OllamaCompleter,
    instructions: OllamaInstructions,
    settingsSchema: OllamaAISettings
  },
  {
    name: 'Gemini',
    chat: ChatGoogleGenerativeAI,
    completer: GeminiCompleter,
    instructions: GeminiInstructions,
    settingsSchema: GeminiSettings
  },
  {
    name: 'OpenAI',
    chat: ChatOpenAI,
    completer: OpenAICompleter,
    settingsSchema: OpenAISettings
  }
];

/**
 * Register the WebLLM provider in a separate plugin since it creates notifications
 * when the model is changed in the settings.
 */
const webLLMProviderPlugin: JupyterFrontEndPlugin<void> = {
  id: '@jupyterlite/ai:webllm',
  description: 'Register the WebLLM provider',
  autoStart: true,
  requires: [IAIProviderRegistry],
  activate: (app: JupyterFrontEnd, registry: IAIProviderRegistry) => {
    registry.add({
      name: 'WebLLM',
      chat: ChatWebLLM,
      completer: WebLLMCompleter,
      settingsSchema: WebLLMSettings,
      instructions: WebLLMInstructions,
      compatibilityCheck: webLLMCompatibilityCheck,
      exposeChatModel: true
    });

    registry.providerChanged.connect(async (sender, role) => {
      const { currentChatModel } = registry;

      // TODO: implement a proper way to handle models that may need to be initialized before being used.
      // Mostly applies to WebLLM and ChromeAI as they may need to download the model in the browser first.
      if (registry.currentName(role) === 'WebLLM') {
        // Leaving this check here, but it should never happen, this check is done in
        // the provider registry, and the current name is set to 'None' if there is a
        // compatibility error.
        const compatibilityError = await webLLMCompatibilityCheck();
        if (compatibilityError) {
          return;
        }

        const model = currentChatModel as ChatWebLLM;
        if (model === null || !model.model) {
          return;
        }

        // Find if the model is part of the prebuiltAppConfig
        const modelRecord = prebuiltAppConfig.model_list.find(
          modelRecord => modelRecord.model_id === model.model
        );
        if (!modelRecord) {
          Notification.dismiss();
          Notification.emit(
            `Model ${model.model} not found in the prebuiltAppConfig`,
            'error',
            {
              autoClose: 2000
            }
          );
          return;
        }

        // create a notification
        const notification = Notification.emit(
          'Loading model...',
          'in-progress',
          {
            autoClose: false,
            progress: 0
          }
        );
        try {
          void model.initialize(report => {
            const { progress, text } = report;
            if (progress === 1) {
              Notification.update({
                id: notification,
                progress: 1,
                message: `Model ${model.model} loaded successfully`,
                type: 'success',
                autoClose: 2000
              });
              return;
            }
            Notification.update({
              id: notification,
              progress: progress / 1,
              message: text,
              type: 'in-progress'
            });
          });
        } catch (err) {
          Notification.update({
            id: notification,
            progress: 1,
            message: `Error loading model ${model.model}`,
            type: 'error',
            autoClose: 2000
          });
        }
      }
    });
  }
};

/**
 * Register all default AI providers.
 */
const aiProviderPlugins = AIProviders.map(provider => {
  return {
    id: `@jupyterlite/ai:${provider.name}`,
    autoStart: true,
    requires: [IAIProviderRegistry],
    activate: (app: JupyterFrontEnd, registry: IAIProviderRegistry) => {
      registry.add(provider);
    }
  };
});

export const defaultProviderPlugins: JupyterFrontEndPlugin<void>[] = [
  webLLMProviderPlugin,
  ...aiProviderPlugins
];
