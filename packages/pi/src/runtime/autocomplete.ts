import type { AutocompleteProviderFactory } from '@earendil-works/pi-coding-agent';
import type { Contents } from '@jupyterlab/services';
import fs from 'fs';

import { SUGGESTION_TTL_MS, type DriveOperations } from './drive';
import { toContentsPath } from './vfs';

/**
 * Path completion (Tab) of pi's editor on the drive. pi lists a directory
 * with readdirSync, on the in-memory file system: the wrapper loads the drive
 * directories that pi asks for, then lets pi complete again.
 */
export function driveAutocomplete(
  operations: DriveOperations
): AutocompleteProviderFactory {
  let listing:
    | { directory: string; time: number; entries: Contents.IModel[] }
    | undefined;
  const shim = fs as unknown as {
    listDrive?: (directory: string) => object[];
  };
  const load = async (directory: string): Promise<void> => {
    // pi suggests nothing in a directory that cannot be listed.
    const entries = await operations
      .list(toContentsPath(directory)!)
      .catch(() => []);
    listing = { directory, time: Date.now(), entries };
  };
  return current => ({
    triggerCharacters: current.triggerCharacters,
    applyCompletion: current.applyCompletion.bind(current),
    shouldTriggerFileCompletion:
      current.shouldTriggerFileCompletion?.bind(current),
    async getSuggestions(lines, line, column, options) {
      const missing = new Set<string>();
      // pi lists the directory before its first await: the drive listings
      // apply to this call only.
      const suggest = () => {
        shim.listDrive = directory => {
          if (
            listing?.directory !== directory ||
            Date.now() - listing.time > SUGGESTION_TTL_MS
          ) {
            missing.add(directory);
            return [];
          }
          return listing.entries.map(({ name, type }) => ({
            name,
            isDirectory: () => type === 'directory',
            isSymbolicLink: () => false
          }));
        };
        try {
          return current.getSuggestions(lines, line, column, options);
        } finally {
          shim.listDrive = undefined;
        }
      };
      const suggestions = suggest();
      if (!missing.size) {
        return suggestions;
      }
      // The editor waits for this call: a newer key aborts it.
      const { signal } = options;
      await Promise.race([
        Promise.all([...missing].map(load)),
        new Promise(resolve =>
          signal.addEventListener('abort', resolve, { once: true })
        )
      ]);
      return signal.aborted ? suggestions : suggest();
    }
  });
}
