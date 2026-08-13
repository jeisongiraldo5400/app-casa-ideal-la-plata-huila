import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const OPTIONS = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
const SECURE_KEY_PATTERN = /^[A-Za-z0-9._-]+$/;

export const SECURE_KEYS = {
  lastOnlineVerifiedAt: 'casa_ideal.last_online_verified_at',
  cachedRoles: 'casa_ideal.cached_roles',
  appLockEnabled: 'casa_ideal.app_lock_enabled',
} as const;

const LEGACY_KEYS: Record<string, string> = {
  [SECURE_KEYS.lastOnlineVerifiedAt]: '@casa_ideal/last_online_verified_at',
  [SECURE_KEYS.cachedRoles]: '@casa_ideal/cached_roles',
  [SECURE_KEYS.appLockEnabled]: '@casa_ideal/app_lock_enabled',
};

export function isValidSecureStoreKey(key: string): boolean {
  return Boolean(key) && SECURE_KEY_PATTERN.test(key);
}

function assertSecureKey(key: string) {
  if (!isValidSecureStoreKey(key)) {
    throw new Error(
      `Invalid SecureStore key "${key}". Use only alphanumeric characters, ".", "-" and "_".`
    );
  }
}

async function readLegacy(key: string): Promise<string | null> {
  if (Platform.OS === 'ios') return null;
  const legacy = LEGACY_KEYS[key];
  if (!legacy) return null;
  try {
    const raw = await SecureStore.getItemAsync(legacy);
    if (!raw) return null;
    await SecureStore.setItemAsync(key, raw, OPTIONS);
    await SecureStore.deleteItemAsync(legacy).catch(() => undefined);
    return raw;
  } catch {
    return null;
  }
}

export async function setSecureJson(key: string, value: unknown) {
  assertSecureKey(key);
  await SecureStore.setItemAsync(key, JSON.stringify(value), OPTIONS);
}

export async function getSecureJson<T>(key: string): Promise<T | null> {
  assertSecureKey(key);
  const raw = (await SecureStore.getItemAsync(key)) ?? (await readLegacy(key));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    await SecureStore.deleteItemAsync(key).catch(() => undefined);
    return null;
  }
}

export async function deleteSecureKey(key: string) {
  assertSecureKey(key);
  await SecureStore.deleteItemAsync(key).catch(() => undefined);
  if (Platform.OS === 'android') {
    const legacy = LEGACY_KEYS[key];
    if (legacy) await SecureStore.deleteItemAsync(legacy).catch(() => undefined);
  }
}

export async function setLastOnlineVerifiedAt(timestamp = Date.now()) {
  assertSecureKey(SECURE_KEYS.lastOnlineVerifiedAt);
  await SecureStore.setItemAsync(SECURE_KEYS.lastOnlineVerifiedAt, String(timestamp), OPTIONS);
}

export async function getLastOnlineVerifiedAt(): Promise<number | null> {
  const raw =
    (await SecureStore.getItemAsync(SECURE_KEYS.lastOnlineVerifiedAt)) ??
    (await readLegacy(SECURE_KEYS.lastOnlineVerifiedAt));
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

export type CachedRoles = {
  userId: string;
  roles: { id: string; role_id: string; role: { id: string; nombre: string } | null }[];
};

export async function setCachedRoles(value: CachedRoles) {
  await setSecureJson(SECURE_KEYS.cachedRoles, value);
}

export async function getCachedRoles(): Promise<CachedRoles | null> {
  return getSecureJson<CachedRoles>(SECURE_KEYS.cachedRoles);
}

export async function clearOfflineSecureData() {
  await Promise.all([
    deleteSecureKey(SECURE_KEYS.lastOnlineVerifiedAt),
    deleteSecureKey(SECURE_KEYS.cachedRoles),
  ]);
}
