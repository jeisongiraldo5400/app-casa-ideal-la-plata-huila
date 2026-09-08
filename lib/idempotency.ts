import AsyncStorage from '@react-native-async-storage/async-storage';

const IDEMPOTENCY_PREFIX = '@casa_ideal/idempotency/';

export function createIdempotencyKey(): string {
  const nativeCrypto = globalThis.crypto;
  if (nativeCrypto && typeof nativeCrypto.randomUUID === 'function') {
    return nativeCrypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    return (character === 'x' ? random : (random & 0x3) | 0x8).toString(16);
  });
}

function fingerprintStorageKey(operation: string, fingerprint: string): string {
  let hash = 2166136261;
  for (let index = 0; index < fingerprint.length; index += 1) {
    hash ^= fingerprint.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${IDEMPOTENCY_PREFIX}${operation}/${(hash >>> 0).toString(16)}`;
}

export async function getOrCreatePersistentIdempotencyKey(
  operation: string,
  fingerprint: string
): Promise<string> {
  const storageKey = fingerprintStorageKey(operation, fingerprint);
  const existing = await AsyncStorage.getItem(storageKey);
  if (existing) return existing;
  const key = createIdempotencyKey();
  await AsyncStorage.setItem(storageKey, key);
  return key;
}

export async function clearPersistentIdempotencyKey(
  operation: string,
  fingerprint: string
): Promise<void> {
  await AsyncStorage.removeItem(fingerprintStorageKey(operation, fingerprint));
}
