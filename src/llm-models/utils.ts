import { ChatAnthropic } from '@langchain/anthropic';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { ChatMistralAI } from '@langchain/mistralai';
import { JSONObject } from '@lumino/coreutils';

import { IBaseCompleter } from './base-completer';
import { CodestralCompleter } from './codestral-completer';
import { ReadonlyPartialJSONObject } from '@lumino/coreutils';

import mistralAI from '../_provider-settings/mistralAI.json';

/**
 * Get an LLM completer from the name.
 */
export function getCompleter(
  name: string,
  settings: ReadonlyPartialJSONObject
): IBaseCompleter | null {
  if (name === 'MistralAI') {
    return new CodestralCompleter({ settings });
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
  }
  return 'Unknown provider';
}

/*
 * Get an LLM completer from the name.
 */
export function getSettings(name: string): JSONObject | null {
  if (name === 'MistralAI') {
    return mistralAI.definitions.ChatMistralAIInput.properties;
  }
  return null;
}
