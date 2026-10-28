/**
 * Built-in (release-pinned) and locally imported SoundFont loading.
 * The default bank is generated into static 12 MiB parts during build;
 * it is never fetched cross-origin by the browser.
 */
export const BUILTIN_SOUNDFONT_NAME = 'MuseScore General v0.2';
export const BUILTIN_SOUNDFONT_SHA256 = '5b85b6c2c61d10b2b91cddd41efcce7b25cd31c8271d511c73afafbef20b6fa3';
export const BUILTIN_SOUNDFONT_SIZE = 39_900_972;
export const MAX_CUSTOM_SOUNDFONT_SIZE = 256 * 1024 * 1024;

export type SoundBankSource = 'builtin' | 'custom';
export interface StoredSoundBank {
  filename: string;
  blob: Blob;
}

type BankManifest = {
  schemaVersion: number;
  sha256: string;
  byteLength: number;
  parts: { name: string; byteLength: number }[];
};

function assetUrl(path: string): string {
  const root = new URL(import.meta.env.BASE_URL, window.location.origin);
  return new URL(path, root).href;
}

export function assertSoundFontHeader(bytes: ArrayBuffer): void {
  if (bytes.byteLength < 12) throw new Error('SoundFont is too small.');
  const view = new DataView(bytes);
  const fourCC = (offset: number) =>
    String.fromCharCode(...new Uint8Array(bytes, offset, 4));
  if (fourCC(0) !== 'RIFF' || fourCC(8) !== 'sfbk' ||
      view.getUint32(4, true) + 8 !== bytes.byteLength) {
    throw new Error('Expected a valid RIFF SF2/SF3 SoundFont (sfbk).');
  }
}

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
}

export async function loadBuiltInBank(): Promise<ArrayBuffer> {
  const base = 'soundfonts/musescore-general/';
  const manifestResponse = await fetch(assetUrl(base + 'manifest.json'));
  if (!manifestResponse.ok) throw new Error('Included piano bank manifest is unavailable.');
  const manifest = await manifestResponse.json() as BankManifest;

  if (manifest.schemaVersion !== 1 ||
      manifest.sha256 !== BUILTIN_SOUNDFONT_SHA256 ||
      manifest.byteLength !== BUILTIN_SOUNDFONT_SIZE ||
      !Array.isArray(manifest.parts) || manifest.parts.length === 0 ||
      manifest.parts.some((part, i) => part.name !== 'part-' + String(i).padStart(2, '0') + '.bin' ||
        !Number.isSafeInteger(part.byteLength) ||
        part.byteLength < 1 || part.byteLength > 12 * 1024 * 1024) ||
      manifest.parts.reduce((sum, part) => sum + part.byteLength, 0) !== BUILTIN_SOUNDFONT_SIZE) {
    throw new Error('Included piano bank manifest is invalid.');
  }

  const combined = new Uint8Array(BUILTIN_SOUNDFONT_SIZE);
  let offset = 0;
  for (const part of manifest.parts) {
    const response = await fetch(assetUrl(base + part.name));
    if (!response.ok) throw new Error('Missing piano bank asset: ' + part.name);
    const data = new Uint8Array(await response.arrayBuffer());
    if (data.length !== part.byteLength) throw new Error('Piano bank part has wrong length: ' + part.name);
    combined.set(data, offset);
    offset += data.length;
  }

  const bytes = combined.buffer;
  assertSoundFontHeader(bytes);
  if (await sha256Hex(bytes) !== BUILTIN_SOUNDFONT_SHA256) {
    throw new Error('Built-in SoundFont checksum mismatch.');
  }
  return bytes;
}

export async function validateCustomBank(file: File): Promise<ArrayBuffer> {
  if (!/\.(sf2|sf3)$/i.test(file.name)) throw new Error('Select an SF2 or SF3 bank.');
  if (file.size <= 12 || file.size > MAX_CUSTOM_SOUNDFONT_SIZE) {
    throw new Error('Custom SoundFont must be between 12 bytes and 256 MiB.');
  }
  const data = await file.arrayBuffer();
  assertSoundFontHeader(data);
  return data;
}

const DB_NAME = 'notare-soundfonts-v1';
const STORE_NAME = 'bank';
const BANK_ID = 'custom';

function openBankDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE_NAME)) {
        req.result.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Cannot open local SoundFont storage.'));
  });
}

export async function saveCustomBank(file: File): Promise<void> {
  const db = await openBankDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put({ filename: file.name, blob: file }, BANK_ID);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Could not save SoundFont locally.'));
      tx.onabort = () => reject(tx.error ?? new Error('SoundFont storage transaction aborted.'));
    });
  } finally {
    db.close();
  }
}

export async function loadCustomBank(): Promise<StoredSoundBank | null> {
  const db = await openBankDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(BANK_ID);
      req.onsuccess = () => {
        const value = req.result as StoredSoundBank | undefined;
        resolve(value?.blob instanceof Blob ? value : null);
      };
      req.onerror = () => reject(req.error ?? new Error('Cannot read stored SoundFont.'));
    });
  } finally {
    db.close();
  }
}

export function workletUrl(): string {
  return assetUrl('spessasynth_processor.min.js');
}
