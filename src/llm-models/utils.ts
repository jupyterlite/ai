import { ChatAnthropic } from '@langchain/anthropic';
import { ChromeAI } from '@langchain/community/experimental/llms/chrome_ai';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { ChatMistralAI } from '@langchain/mistralai';
import { JSONObject } from '@lumino/coreutils';

import { IBaseCompleter } from './base-completer';
import { AnthropicCompleter } from './anthropic-completer';
import { CodestralCompleter } from './codestral-completer';
import { ReadonlyPartialJSONObject } from '@lumino/coreutils';
import { ChromeCompleter } from './chrome-completer';

import chromeAI from '../_provider-settings/chromeAI.json';
import mistralAI from '../_provider-settings/mistralAI.json';
import anthropic from '../_provider-settings/anthropic.json';

/**
 * Get an LLM completer from the name.
 */
export function getCompleter(
  name: string,
  settings: ReadonlyPartialJSONObject
): IBaseCompleter | null {
  if (name === 'MistralAI') {
    return new CodestralCompleter({ settings });
  } else if (name === 'Anthropic') {
    return new AnthropicCompleter({ settings });
  } else if (name === 'ChromeAI') {
    return new ChromeCompleter({ settings });
  }
  return null;
}

/**
 * Get an LLM chat model from the name.
 */
export function getChatModel(
  name: string,
  settings: ReadonlyPartialJSONObject
): BaseChatModel | null {
  if (name === 'MistralAI') {
    return new ChatMistralAI({ ...settings });
  } else if (name === 'Anthropic') {
    return new ChatAnthropic({ ...settings });
  } else if (name === 'ChromeAI') {
    // TODO: fix
    // @ts-expect-error
    return new ChromeAI({ ...settings });
  }
  return null;
}

/**
 * Get the error message from provider.
 */
export function getErrorMessage(name: string, error: any): string {
  if (name === 'MistralAI') {
    return error.message;
  } else if (name === 'Anthropic') {
    return error.error.error.message;
  } else if (name === 'ChromeAI') {
    return error.message;
  }
  return 'Unknown provider';
}

/*
 * Get an LLM completer from the name.
 */
export function getSettings(name: string): JSONObject | null {
  if (name === 'MistralAI') {
    return mistralAI.definitions.ChatMistralAIInput.properties;
  } else if (name === 'Anthropic') {
    return anthropic.definitions.AnthropicInput.properties;
  } else if (name === 'ChromeAI') {
    return chromeAI.definitions.ChromeAI.properties;
  }

  return null;
}
