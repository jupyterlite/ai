import { computeCodeChallenge, generateCodeVerifier } from './pkce';

const AUTH_URL = 'https://openrouter.ai/auth';
const KEYS_URL = 'https://openrouter.ai/api/v1/auth/keys';

/**
 * The name of the messages between the windows, and of the session storage
 * entry that marks the popup window.
 */
const CHANNEL = '@jupyternaut/persona:openrouter-auth';
const POPUP_WIDTH = 600;
const POPUP_HEIGHT = 800;
const POPUP_POLL_INTERVAL = 500;
const POPUP_CLOSE_DELAY = 1000;

/**
 * The message from the popup window. The ID identifies the request, and the
 * code is null if the user denied the request.
 */
interface IAuthMessage {
  type: typeof CHANNEL;
  id: string;
  code: string | null;
}

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
 * Resolves to null if the user denies the request or closes the popup window,
 * or if the signal aborts.
 *
 * The browser blocks the popup unless the call comes from a user action.
 */
export async function requestApiKey(
  options: { keyLabel?: string; signal?: AbortSignal } = {}
): Promise<string | null> {
  // The popup window gets a copy of the session storage when it opens.
  const id = crypto.randomUUID();
  window.sessionStorage.setItem(CHANNEL, id);
  const left = window.screenX + (window.outerWidth - POPUP_WIDTH) / 2;
  const top = window.screenY + (window.outerHeight - POPUP_HEIGHT) / 2;
  const popup = window.open(
    '',
    '_blank',
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

  const code = await waitForCode(popup, id, options.signal);
  return code === null ? null : exchangeCode(code, verifier);
}

/**
 * Wait for the message of the popup window, or for the user to close it.
 *
 * The message comes from `window.opener`, and from a broadcast channel for the
 * case where a page in the popup, such as a login page, cuts the opener link.
 * The channel reaches all the windows of the origin, so only the message with
 * the ID of this request counts. A page that cuts the opener link also reports
 * the popup as closed, so a close counts only while this window has the focus.
 */
function waitForCode(
  popup: Window,
  id: string,
  signal?: AbortSignal
): Promise<string | null> {
  return new Promise(resolve => {
    const channel = new BroadcastChannel(CHANNEL);
    let closedSince: number | null = null;
    const finish = (code: string | null) => {
      window.clearInterval(pollTimer);
      window.removeEventListener('message', onMessage);
      channel.close();
      signal?.removeEventListener('abort', cancel);
      popup.close();
      resolve(code);
    };
    const cancel = () => finish(null);
    const onMessage = (event: MessageEvent<IAuthMessage>) => {
      if (
        event.origin === window.location.origin &&
        event.data?.type === CHANNEL &&
        event.data.id === id
      ) {
        finish(event.data.code);
      }
    };
    // The popup posts its message before it closes itself.
    const pollTimer = window.setInterval(() => {
      if (!popup.closed || !document.hasFocus()) {
        closedSince = null;
      } else if (closedSince === null) {
        closedSince = Date.now();
      } else if (Date.now() - closedSince >= POPUP_CLOSE_DELAY) {
        finish(null);
      }
    }, POPUP_POLL_INTERVAL);
    window.addEventListener('message', onMessage);
    channel.addEventListener('message', onMessage);
    signal?.addEventListener('abort', cancel);
    if (signal?.aborted) {
      cancel();
    }
  });
}

/**
 * In the popup window, send the authorization code to the window that opened
 * it, then close the popup. Does nothing in any other window, even if its URL
 * has a `code` parameter.
 */
export function forwardAuthCode(): void {
  const id = window.sessionStorage.getItem(CHANNEL);
  if (id === null) {
    return;
  }
  window.sessionStorage.removeItem(CHANNEL);

  const message: IAuthMessage = {
    type: CHANNEL,
    id,
    code: new URL(window.location.href).searchParams.get('code')
  };
  window.opener?.postMessage(message, window.location.origin);
  const channel = new BroadcastChannel(CHANNEL);
  channel.postMessage(message);
  channel.close();
  window.close();
}
