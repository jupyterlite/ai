function fileURLToPath(url) {
  const parsed = typeof url === 'string' ? new URL(url) : url;
  return decodeURIComponent(parsed.pathname);
}

function pathToFileURL(path) {
  return new URL(`file://${encodeURI(path)}`);
}

module.exports = { URL: globalThis.URL, fileURLToPath, pathToFileURL };
