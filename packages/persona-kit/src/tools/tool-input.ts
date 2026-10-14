import type { ITool } from '../tokens';

/**
 * The JSON schema of the input of a tool, as the model should see it. Zod
 * schemas and AI SDK JSON schema objects are supported.
 */
export function getToolInputSchema(tool: ITool): Record<string, unknown> {
  const schema = tool.inputSchema as any;
  let json: Record<string, unknown> | undefined;
  if (typeof schema?.toJSONSchema === 'function') {
    // The model writes the input of transforms, as in the AI SDK. Types
    // without a JSON schema (dates) accept any value.
    json = schema.toJSONSchema({ io: 'input', unrepresentable: 'any' });
  } else if (schema?.jsonSchema && typeof schema.jsonSchema === 'object') {
    json = schema.jsonSchema;
  }
  if (!json) {
    throw new Error(
      'Unsupported tool input schema: expected a zod schema or an AI SDK JSON schema object'
    );
  }
  const result = { ...json };
  delete result.$schema;
  return result;
}

/**
 * The input of a tool call as the tool expects it: zod schemas apply their
 * defaults and transforms, as in the AI SDK.
 */
export async function parseToolInput(
  name: string,
  tool: ITool,
  input: unknown
): Promise<unknown> {
  const schema = tool.inputSchema as any;
  if (typeof schema?.safeParseAsync !== 'function') {
    return input;
  }
  const result = await schema.safeParseAsync(input);
  if (!result.success) {
    throw new Error(`Invalid input for ${name}: ${result.error?.message}`);
  }
  return result.data;
}
