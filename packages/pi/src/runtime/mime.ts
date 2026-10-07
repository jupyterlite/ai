import type { ImageContent } from '@earendil-works/pi-ai';

import { ANSI_PATTERN } from './shell';

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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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
