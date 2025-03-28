export const SECRETS_NAMESPACE = '@jupyterlite/ai';
export const SECRETS_REPLACEMENT = '***';

export function getSecretId(provider: string, label: string) {
  return `${provider}-${label}`;
}
