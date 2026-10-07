/**
 * Clipboard of the browser for pi.
 */
export async function copyToClipboard(text) {
  await navigator.clipboard.writeText(text);
}

export async function readClipboardText() {
  try {
    return (await navigator.clipboard.readText()) || null;
  } catch {
    return null;
  }
}

export async function readClipboardFilePaths() {
  return null;
}
