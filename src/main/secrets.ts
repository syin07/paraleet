// The Anthropic API key at rest (PRD section 9): encrypted with the operating system's keychain
// facilities through Electron's safeStorage, in its own small file next to the database. It is
// never in the database, never in the repo, never in a log, and never sent to the UI.
import { chmodSync, existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import type { SecretStore } from './services';

export const API_KEY_FILE_NAME = 'anthropic-api-key.bin';

/** How bytes are sealed. Electron's safeStorage in the app; a stand-in in tests. */
export interface Sealer {
  available(): boolean;
  seal(text: string): Buffer;
  open(sealed: Buffer): string;
}

/** A key store that keeps one sealed file at `filePath`. */
export function createSecretStore(filePath: string, sealer: Sealer): SecretStore {
  return {
    available: () => sealer.available(),

    getApiKey() {
      if (!sealer.available() || !existsSync(filePath)) return null;
      try {
        const key = sealer.open(readFileSync(filePath)).trim();
        return key === '' ? null : key;
      } catch {
        // Sealed on another Mac or by another user, or damaged: as good as no key. It is left in
        // place; saving a new key replaces it.
        return null;
      }
    },

    setApiKey(key) {
      if (!sealer.available()) throw new Error('Encryption is not available');
      // Written beside the target and renamed, so a crash never leaves half a file.
      const temporary = `${filePath}.tmp`;
      writeFileSync(temporary, sealer.seal(key), { mode: 0o600 });
      chmodSync(temporary, 0o600);
      renameSync(temporary, filePath);
    },

    clearApiKey() {
      rmSync(filePath, { force: true });
      rmSync(`${filePath}.tmp`, { force: true });
    },
  };
}
