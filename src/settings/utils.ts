export const SECRETS_REPLACEMENT = '***';

export function getSecretId(provider: string, label: string) {
  return `${provider}-${label}`;
}
