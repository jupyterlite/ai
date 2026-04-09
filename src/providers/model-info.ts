import type {
  IProviderConfig,
  IProviderInfo,
  IProviderModelInfo,
  IProviderRegistry
} from '../tokens';

const DATE_SUFFIX = /^(.*)-\d{4}-\d{2}-\d{2}$/;
const SHORT_VERSION_SUFFIX = /^(.*)-\d{4}$/;

// Treat rolling aliases and dated releases as the same model family so they
// can share provider metadata such as context windows.
function normalizeModelId(modelId: string): string {
  if (modelId.endsWith('-latest')) {
    return modelId.slice(0, -7);
  }

  const dateSuffixMatch = modelId.match(DATE_SUFFIX);
  if (dateSuffixMatch) {
    return dateSuffixMatch[1];
  }

  const shortVersionSuffixMatch = modelId.match(SHORT_VERSION_SUFFIX);
  if (shortVersionSuffixMatch) {
    return shortVersionSuffixMatch[1];
  }

  return modelId;
}

function getCandidateModelIds(modelId: string): string[] {
  const candidates = [modelId];
  const normalizedModelId = normalizeModelId(modelId);

  candidates.push(normalizedModelId);

  if (normalizedModelId !== modelId) {
    candidates.push(`${normalizedModelId}-latest`);
  }

  return [...new Set(candidates)];
}

export function getProviderModelInfo(
  providerInfo: IProviderInfo | null | undefined,
  model: string | undefined
): IProviderModelInfo | undefined {
  if (!providerInfo || !model) {
    return undefined;
  }

  const modelInfo = providerInfo.modelInfo;
  if (!modelInfo) {
    return undefined;
  }

  for (const candidateId of getCandidateModelIds(model)) {
    if (modelInfo[candidateId]) {
      return modelInfo[candidateId];
    }
  }

  const normalizedModelId = normalizeModelId(model);
  // As a last resort, match any known model entry that normalizes to the same
  // base ID, even if the exact alias/version string differs.
  return Object.entries(modelInfo).find(([candidateId]) => {
    return normalizeModelId(candidateId) === normalizedModelId;
  })?.[1];
}

export function getEffectiveContextWindow(
  providerConfig: IProviderConfig | undefined,
  providerRegistry?: IProviderRegistry
): number | undefined {
  if (!providerConfig) {
    return undefined;
  }

  if (providerConfig.parameters?.contextWindow !== undefined) {
    return providerConfig.parameters.contextWindow;
  }

  const providerInfo = providerRegistry?.getProviderInfo(
    providerConfig.provider
  );
  return getProviderModelInfo(providerInfo, providerConfig.model)
    ?.contextWindow;
}
