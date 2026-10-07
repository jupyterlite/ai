import type { ImageContent } from '@earendil-works/pi-ai';
import type { IMimeModelBody } from '@jupyter/chat';

import { ANSI_PATTERN } from './shell';

interface IDisplayOutput {
  output_type: string;
  data?: unknown;
  metadata?: unknown;
}

/**
 * Images of the outputs that go to the model as images.
 */
const MODEL_IMAGE_TYPES = new Set([
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp'
]);
const MAX_MODEL_IMAGES = 4;
const MIME_TYPE = /^[a-z]+\/[\w.+-]+$/;
/**
 * Output data that goes to the model as text.
 */
const MODEL_TEXT_TYPES = new Set([
  'application/json',
  'text/latex',
  'text/markdown',
  'text/plain'
]);

const DISPLAY_OUTPUT_TYPES = new Set([
  'display_data',
  'update_display_data',
  'execute_result'
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isDisplayOutput(value: unknown): value is IDisplayOutput {
  return (
    isPlainObject(value) &&
    typeof value.output_type === 'string' &&
    DISPLAY_OUTPUT_TYPES.has(value.output_type)
  );
}

function displayOutputs(value: unknown): IDisplayOutput[] {
  if (isDisplayOutput(value)) {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.filter(isDisplayOutput);
  }
  if (!isPlainObject(value)) {
    return [];
  }
  return Array.isArray(value.outputs)
    ? value.outputs.filter(isDisplayOutput)
    : displayOutputs(value.result);
}

/**
 * The rich outputs (display data) in the result of a JupyterLab command, as
 * chat MIME bundles.
 */
export function mimeBundles(
  result: unknown,
  trustedMimeTypes: ReadonlySet<string>
): IMimeModelBody[] {
  return displayOutputs(result)
    .filter(
      output => isPlainObject(output.data) && Object.keys(output.data).length
    )
    .map(output => {
      const data = output.data as IMimeModelBody['data'];
      return {
        data,
        ...(isPlainObject(output.metadata) && {
          metadata: output.metadata as IMimeModelBody['metadata']
        }),
        ...(Object.keys(data).some(type => trustedMimeTypes.has(type)) && {
          trusted: true
        })
      };
    });
}

/**
 * The result of a JupyterLab command for the model: the output images as
 * image content, a placeholder for the other rich data (HTML, widgets...),
 * and no terminal colors (tracebacks).
 */
export function modelView(result: unknown): {
  value: unknown;
  images: ImageContent[];
} {
  const images: ImageContent[] = [];
  const visit = (value: unknown, isBundle = false): unknown => {
    if (typeof value === 'string') {
      return value.replace(ANSI_PATTERN, '');
    }
    if (Array.isArray(value)) {
      return value.map(item => visit(item));
    }
    if (!isPlainObject(value)) {
      return value;
    }
    const entries = Object.entries(value).map(([key, item]) => {
      if (!isBundle || !MIME_TYPE.test(key) || MODEL_TEXT_TYPES.has(key)) {
        return [key, visit(item, key === 'data')];
      }
      if (
        MODEL_IMAGE_TYPES.has(key) &&
        typeof item === 'string' &&
        images.length < MAX_MODEL_IMAGES
      ) {
        images.push({
          type: 'image',
          data: item.replace(/\s/g, ''),
          mimeType: key
        });
        return [key, '[attached image]'];
      }
      return [key, `[${key} output]`];
    });
    return Object.fromEntries(entries);
  };
  // The model reads the JSON form of the result (dates, toJSON).
  const text = JSON.stringify(result);
  const json = text === undefined ? undefined : JSON.parse(text);
  return { value: visit(json), images };
}
