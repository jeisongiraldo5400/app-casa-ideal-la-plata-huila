import * as SecureStore from 'expo-secure-store';

const OPTIONS = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

export const SECURE_KEYS = {
  lastOnlineVerifiedAt: '@casa_ideal/last_online_verified_at',
  cachedRoles: '@casa_ideal/cached_roles',
  appLockEnabled: '@casa_ideal/app_lock_enabled',
} as const;

export async function setSecureJson(key: string, value: unknown) {
  await SecureStore.setItemAsync(key, JSON.stringify(value), OPTIONS);
}

export async function getSecureJson<T>(key: string): Promise<T | null> {
  const raw = await SecureStore.getItemAsync(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    await SecureStore.deleteItemAsync(key);
    return null;
  }
}

export async function deleteSecureKey(key: string) {
  await SecureStore.deleteItemAsync(key);
}

export async function setLastOnlineVerifiedAt(timestamp = Date.now()) {
  await SecureStore.setItemAsync(SECURE_KEYS.lastOnlineVerifiedAt, String(timestamp), OPTIONS);
}

export async function getLastOnlineVerifiedAt(): Promise<number | null> {
  const raw = await SecureStore.getItemAsync(SECURE_KEYS.lastOnlineVerifiedAt);
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
