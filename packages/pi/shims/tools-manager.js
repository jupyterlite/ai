/**
 * No fd or ripgrep binaries in the browser, and no downloads: `fd` is a
 * command of the page (see the child_process shim), for the file suggestions
 * of the editor.
 */
export async function ensureTool(tool) {
  return tool === 'fd' ? 'fd' : undefined;
}
