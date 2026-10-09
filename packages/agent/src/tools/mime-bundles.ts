import type { IRenderMime } from '@jupyterlab/rendermime';

interface IDisplayOutput {
  output_type: string;
  data?: unknown;
  metadata?: unknown;
}

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
 * chat MIME bundles. A bundle with a trusted MIME type is trusted.
 */
export function extractMimeBundles(
  result: unknown,
  trustedMimeTypes: ReadonlySet<string>
): (Partial<IRenderMime.IMimeModel> & Pick<IRenderMime.IMimeModel, 'data'>)[] {
  return displayOutputs(result)
    .filter(
      output => isPlainObject(output.data) && Object.keys(output.data).length
    )
    .map(output => {
      const data = output.data as IRenderMime.IMimeModel['data'];
      return {
        data,
        ...(isPlainObject(output.metadata) && {
          metadata: output.metadata as IRenderMime.IMimeModel['metadata']
        }),
        ...(Object.keys(data).some(type => trustedMimeTypes.has(type)) && {
          trusted: true
        })
      };
    });
}
