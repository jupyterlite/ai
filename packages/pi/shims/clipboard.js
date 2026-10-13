/**
 * Clipboard of the browser for pi (`utils/clipboard.js` and
 * `utils/clipboard-image.js`).
 */
const IMAGE_EXTENSIONS = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif'
};

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

export function extensionForImageMimeType(mimeType) {
  return IMAGE_EXTENSIONS[mimeType.split(';')[0].trim().toLowerCase()] ?? null;
}

export async function readClipboardImage() {
  try {
    for (const item of await navigator.clipboard.read()) {
      const type = item.types.find(type => type in IMAGE_EXTENSIONS);
      if (type) {
        const blob = await item.getType(type);
        return {
          bytes: new Uint8Array(await blob.arrayBuffer()),
          mimeType: type
        };
      }
    }
  } catch {
    // No access to the clipboard: pi pastes the text.
  }
  return null;
}
