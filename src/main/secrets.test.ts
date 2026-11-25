import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSecretStore, type Sealer } from './secrets';

// A stand-in for the keychain: reversible, and nothing like the plain text.
const sealer: Sealer & { on: boolean } = {
  on: true,
  available: () => sealer.on,
  seal: (text) => Buffer.from([...Buffer.from(`sealed:${text}`, 'utf8')].map((byte) => byte ^ 0x5a)),
  open: (sealed) => {
    const text = Buffer.from([...sealed].map((byte) => byte ^ 0x5a)).toString('utf8');
    if (!text.startsWith('sealed:')) throw new Error('not sealed by this keychain');
    return text.slice('sealed:'.length);
  },
};

let dir = '';
let file = '';
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'paraleet-secret-'));
  file = join(dir, 'key.bin');
  sealer.on = true;
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('the API key store', () => {
  it('has no key to begin with', () => {
    expect(createSecretStore(file, sealer).getApiKey()).toBeNull();
  });

  it('keeps a key across restarts, never in plain text, readable only by the user', () => {
    createSecretStore(file, sealer).setApiKey('sk-ant-test-1234567890');
    const onDisk = readFileSync(file);
    expect(onDisk.toString('utf8')).not.toContain('sk-ant');
    expect(onDisk.toString('latin1')).not.toContain('1234567890');
    expect(statSync(file).mode & 0o777).toBe(0o600);
    // A new store, as after a restart.
    expect(createSecretStore(file, sealer).getApiKey()).toBe('sk-ant-test-1234567890');
  });

  it('replaces and removes the key', () => {
    const store = createSecretStore(file, sealer);
    store.setApiKey('first-key-0000000000');
    store.setApiKey('second-key-000000000');
    expect(store.getApiKey()).toBe('second-key-000000000');
    store.clearApiKey();
    expect(store.getApiKey()).toBeNull();
    store.clearApiKey(); // removing nothing is fine
  });

  it('treats a file it cannot open as no key, and a new key replaces it', () => {
    writeFileSync(file, 'this was sealed on another Mac');
    const store = createSecretStore(file, sealer);
    expect(store.getApiKey()).toBeNull();
    store.setApiKey('fresh-key-0000000000');
    expect(store.getApiKey()).toBe('fresh-key-0000000000');
  });

  it('stores nothing when the system cannot encrypt', () => {
    sealer.on = false;
    const store = createSecretStore(file, sealer);
    expect(store.available()).toBe(false);
    expect(() => store.setApiKey('some-key-00000000000')).toThrow();
    expect(store.getApiKey()).toBeNull();
    expect(() => readFileSync(file)).toThrow();
  });
});
