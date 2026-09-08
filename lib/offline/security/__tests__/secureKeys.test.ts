import { isValidSecureStoreKey, SECURE_KEYS } from '../secureKeys';

describe('SECURE_KEYS', () => {
  it('usa claves validas para SecureStore de iOS', () => {
    expect(isValidSecureStoreKey(SECURE_KEYS.cachedRoles)).toBe(true);
    expect(isValidSecureStoreKey(SECURE_KEYS.appLockEnabled)).toBe(true);
    expect(isValidSecureStoreKey(SECURE_KEYS.lastOnlineVerifiedAt)).toBe(true);
    expect(Object.values(SECURE_KEYS).every(isValidSecureStoreKey)).toBe(true);
  });

  it('rechaza @ y / que iOS no admite', () => {
    expect(isValidSecureStoreKey('@casa_ideal/cached_roles')).toBe(false);
    expect(isValidSecureStoreKey('')).toBe(false);
  });
});
