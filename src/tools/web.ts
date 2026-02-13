import { tool } from 'ai';
import { z } from 'zod';
import { ITool } from '../tokens';

const DEFAULT_MAX_CONTENT_CHARS = 20000;
const MAX_ALLOWED_CONTENT_CHARS = 100000;
const DEFAULT_TIMEOUT_MS = 20000;
const MAX_TIMEOUT_MS = 120000;

interface IReadBodyResult {
  content: string;
  isTruncated: boolean;
  totalChars: number;
  totalCharsExact: boolean;
}

/**
 * Read response body text with a character cap.
 *
 * Stops early once the cap is reached to avoid buffering arbitrarily large
 * payloads in memory.
 */
async function readResponseText(
  response: Response,
  maxContentChars: number
): Promise<IReadBodyResult> {
  if (!response.body) {
    const body = await response.text();
    return {
      content: body.slice(0, maxContentChars),
      isTruncated: body.length > maxContentChars,
      totalChars: body.length,
      totalCharsExact: true
    };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let content = '';
  let totalChars = 0;
  let isTruncated = false;
  let done = false;

  while (!done) {
    const readResult = await reader.read();
    done = readResult.done;
    if (done) {
      continue;
    }

    const chunk = decoder.decode(readResult.value, { stream: true });
    if (!chunk) {
      continue;
    }

    totalChars += chunk.length;

    if (!isTruncated) {
      const remaining = maxContentChars - content.length;
      if (chunk.length <= remaining) {
        content += chunk;
      } else {
        content += chunk.slice(0, remaining);
        isTruncated = true;
      }
    }

    if (isTruncated) {
      await reader.cancel();
      return {
        content,
        isTruncated: true,
        totalChars,
        totalCharsExact: false
      };
    }
  }

  const tail = decoder.decode();
  if (tail) {
    totalChars += tail.length;
    const remaining = maxContentChars - content.length;
    if (tail.length <= remaining) {
      content += tail;
    } else {
      content += tail.slice(0, remaining);
      isTruncated = true;
    }
  }

  return {
    content,
    isTruncated,
    totalChars,
    totalCharsExact: true
  };
}

/**
 * Create a browser-native URL fetch tool.
 *
 * This is best-effort and subject to normal browser constraints (CORS, CSP,
 * mixed content, bot protections).
 */
export function createBrowserFetchTool(): ITool {
  return tool({
    title: 'Browser Fetch',
    description:
      'Fetch a URL directly from the browser using HTTP GET. Useful for exact URL inspection when CORS/access permits.',
    inputSchema: z.object({
      url: z.string().describe('HTTP(S) URL to fetch'),
      maxContentChars: z
        .number()
        .int()
        .min(1)
        .max(MAX_ALLOWED_CONTENT_CHARS)
        .optional()
        .describe(
          `Maximum number of response characters to return (default: ${DEFAULT_MAX_CONTENT_CHARS})`
        ),
      timeoutMs: z
        .number()
        .int()
        .min(1000)
        .max(MAX_TIMEOUT_MS)
        .optional()
        .describe(
          `Timeout in milliseconds (default: ${DEFAULT_TIMEOUT_MS}, max: ${MAX_TIMEOUT_MS})`
        )
    }),
    execute: async (input: {
      url: string;
      maxContentChars?: number;
      timeoutMs?: number;
    }) => {
      const maxContentChars = Math.min(
        input.maxContentChars ?? DEFAULT_MAX_CONTENT_CHARS,
        MAX_ALLOWED_CONTENT_CHARS
      );
      const timeoutMs = Math.min(
        input.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        MAX_TIMEOUT_MS
      );

      let parsedUrl: URL;
      try {
        parsedUrl = new URL(input.url);
      } catch {
        return {
          success: false,
          errorType: 'invalid_url',
          error: 'Invalid URL format',
          url: input.url
        };
      }

      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        return {
          success: false,
          errorType: 'unsupported_protocol',
          error: 'Only http:// and https:// URLs are supported',
          url: input.url
        };
      }

      const controller = new AbortController();
      const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(parsedUrl.toString(), {
          method: 'GET',
          redirect: 'follow',
          signal: controller.signal,
          headers: {
            Accept:
              'text/html,text/plain,application/json,text/markdown,*/*;q=0.8'
          }
        });

        const contentType = response.headers.get('content-type') || '';
        const contentLength = response.headers.get('content-length');
        const body = await readResponseText(response, maxContentChars);
        const success = response.ok;

        return {
          success,
          url: response.url,
          requestedUrl: parsedUrl.toString(),
          status: response.status,
          statusText: response.statusText,
          ok: response.ok,
          contentType,
          contentLength,
          ...(success
            ? {}
            : {
                errorType: 'http_error',
                error: `HTTP ${response.status} ${response.statusText}`
              }),
          isTruncated: body.isTruncated,
          returnedChars: body.content.length,
          totalChars: body.totalChars,
          totalCharsExact: body.totalCharsExact,
          content: body.content,
          limitations:
            'Browser fetch is subject to CORS, site bot protections, and browser network policy.'
        };
      } catch (error) {
        if ((error as Error).name === 'AbortError') {
          return {
            success: false,
            errorType: 'timeout',
            error: `Request timed out after ${timeoutMs} ms`,
            url: parsedUrl.toString()
          };
        }

        return {
          success: false,
          errorType: 'network_or_cors',
          error:
            error instanceof Error && error.message
              ? error.message
              : 'Fetch failed',
          url: parsedUrl.toString(),
          likelyCauses: [
            'CORS blocked by the target website',
            'DNS/network resolution failure',
            'TLS/certificate issue',
            'Target server rejected browser access'
          ]
        };
      } finally {
        clearTimeout(timeoutHandle);
      }
    }
  });
}
