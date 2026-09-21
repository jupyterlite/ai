import { computeCodeChallenge, generateCodeVerifier } from './pkce';

const AUTH_URL = 'https://openrouter.ai/auth';
const KEYS_URL = 'https://openrouter.ai/api/v1/auth/keys';

/**
 * The name of the messages between the windows, and of the session storage
 * entry that marks the popup window.
 */
const CHANNEL = '@jupyternaut/persona:openrouter-auth';
const POPUP_NAME = 'jupyternaut-openrouter-auth';
const POPUP_WIDTH = 600;
const POPUP_HEIGHT = 800;
const POPUP_POLL_INTERVAL = 500;
const POPUP_CLOSE_DELAY = 1000;

/**
 * The message from the popup window. The code is null if the user denied the
 * request.
 */
interface IAuthMessage {
  type: typeof CHANNEL;
  code: string | null;
}

let cancelPending: (() => void) | null = null;

/**
 * Get the URL OpenRouter redirects to: the given page URL without a previous
 * code, the Jupyter server token, and the fragment.
 */
function getCallbackUrl(href: string): string {
  const url = new URL(href);
  url.searchParams.delete('code');
  url.searchParams.delete('token');
  url.hash = '';
  return url.toString();
}

/**
 * Build the URL of the OpenRouter authorization page.
 */
function buildAuthUrl(options: {
  callbackUrl: string;
  codeChallenge: string;
  keyLabel?: string;
}): string {
  const params = {
    callback_url: options.callbackUrl,
    code_challenge: options.codeChallenge,
    code_challenge_method: 'S256',
    ...(options.keyLabel && { key_label: options.keyLabel })
  };
  const query = Object.entries(params)
    .map(([name, value]) => `${name}=${encodeURIComponent(value)}`)
    .join('&');
  return `${AUTH_URL}?${query}`;
}

/**
 * Exchange an authorization code for an OpenRouter API key.
 */
async function exchangeCode(code: string, verifier: string): Promise<string> {
  const response = await fetch(KEYS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code,
      code_verifier: verifier,
      code_challenge_method: 'S256'
    })
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || typeof body?.key !== 'string') {
    throw new Error(body?.error?.message ?? `HTTP ${response.status}`);
  }
  return body.key;
}

/**
 * Get an OpenRouter API key with the authorization page in a popup window.
 * Resolves to null if the user denies the request, closes the popup window,
 * or starts another request.
 *
 * The browser blocks the popup unless the call comes from a user action.
 */
export async function requestApiKey(
  options: { keyLabel?: string } = {}
): Promise<string | null> {
  cancelPending?.();

  // The popup window gets a copy of the session storage when it opens.
  window.sessionStorage.setItem(CHANNEL, POPUP_NAME);
  const left = window.screenX + (window.outerWidth - POPUP_WIDTH) / 2;
  const top = window.screenY + (window.outerHeight - POPUP_HEIGHT) / 2;
  const popup = window.open(
    '',
    POPUP_NAME,
    `popup,width=${POPUP_WIDTH},height=${POPUP_HEIGHT},left=${left},top=${top}`
  );
  window.sessionStorage.removeItem(CHANNEL);
  if (!popup) {
    throw new Error('The browser blocked the OpenRouter window');
  }

  const verifier = generateCodeVerifier();
  const codeChallenge = await computeCodeChallenge(verifier);
  popup.location.href = buildAuthUrl({
    callbackUrl: getCallbackUrl(window.location.href),
    codeChallenge,
    keyLabel: options.keyLabel
  });

  const code = await waitForCode(popup);
  return code === null ? null : exchangeCode(code, verifier);
}

/**
 * Wait for the message of the popup window, or for the user to close it.
 *
 * The message comes from `window.opener`, and from a broadcast channel for the
 * case where a page in the popup, such as a login page, cuts the opener link.
 * Such a page also reports the popup as closed, so a close counts only when
 * the focus comes back to this window.
 */
function waitForCode(popup: Window): Promise<string | null> {
  return new Promise(resolve => {
    const channel = new BroadcastChannel(CHANNEL);
    let closeTimer: number | undefined;
    const finish = (code: string | null) => {
      window.clearInterval(pollTimer);
      window.clearTimeout(closeTimer);
      window.removeEventListener('message', onMessage);
      channel.close();
      cancelPending = null;
      resolve(code);
    };
    const onMessage = (event: MessageEvent<IAuthMessage>) => {
      if (
        event.origin === window.location.origin &&
        event.data?.type === CHANNEL
      ) {
        finish(event.data.code);
      }
    };
    // The popup posts its message before it closes itself.
    const pollTimer = window.setInterval(() => {
      if (popup.closed) {
        window.clearInterval(pollTimer);
        closeTimer = window.setTimeout(() => {
          if (document.hasFocus()) {
            finish(null);
          }
        }, POPUP_CLOSE_DELAY);
      }
    }, POPUP_POLL_INTERVAL);
    window.addEventListener('message', onMessage);
    channel.addEventListener('message', onMessage);
    cancelPending = () => finish(null);
  });
}

/**
 * In the popup window, send the authorization code to the window that opened
 * it, then close the popup. Returns false in any other window, even if its URL
 * has a `code` parameter.
 */
export function forwardAuthCode(): boolean {
  if (window.sessionStorage.getItem(CHANNEL) === null) {
    return false;
  }
  window.sessionStorage.removeItem(CHANNEL);

  const message: IAuthMessage = {
    type: CHANNEL,
    code: new URL(window.location.href).searchParams.get('code')
  };
  window.opener?.postMessage(message, window.location.origin);
  const channel = new BroadcastChannel(CHANNEL);
  channel.postMessage(message);
  channel.close();
  window.close();
  return true;
}
