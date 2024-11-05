import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { ChatGroq } from '@langchain/groq';
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
  } else if (name === 'Groq') {
    return new ChatGroq({ ...settings });
  }
  return null;
}

/**
 * Get the error message from provider.
 */
export function getErrorMessage(name: string, error: any): string {
  if (name === 'MistralAI') {
    return error.message;
  } else if (name === 'Groq') {
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
