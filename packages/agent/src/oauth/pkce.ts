const VERIFIER_BYTE_LENGTH = 32;

/**
 * Encode bytes as unpadded base64url.
 */
function base64UrlEncode(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Generate a random PKCE code verifier.
 */
export function generateCodeVerifier(): string {
  return base64UrlEncode(
    crypto.getRandomValues(new Uint8Array(VERIFIER_BYTE_LENGTH))
  );
}

/**
 * Compute the S256 code challenge of a PKCE code verifier.
 */
export async function computeCodeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(verifier)
  );
  return base64UrlEncode(new Uint8Array(digest));
}
