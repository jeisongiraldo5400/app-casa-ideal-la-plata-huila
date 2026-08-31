import { classifyPushError, nextRetryAt, canRetry } from '../retryPolicy';
import { resolveCustomerIdNumberConflict } from '../conflictPolicy';
import {
  isAuthSessionMissingError,
  isInvalidRefreshTokenError,
  isNetworkError,
  isOfflineSessionValid,
  shouldKeepLocalSession,
  shouldLockApp,
} from '../../security/sessionPolicy';
import { assertPullIsComplete, type PullPayload } from '../types';

describe('retryPolicy', () => {
  it('clasifica errores de negocio vs red', () => {
    expect(classifyPushError('El valor supera el saldo')).toBe('fail');
    expect(classifyPushError('Sin permiso sobre este negocio')).toBe('fail');
    expect(classifyPushError('Ya existe un cliente con documento')).toBe('conflict');
    expect(classifyPushError('Network request failed')).toBe('retry');
  });

  it('no reintenta indefinidamente', () => {
    expect(canRetry('error', 8, Date.now() - 1)).toBe(false);
    expect(canRetry('pending', 0, Date.now() - 1)).toBe(true);
    expect(nextRetryAt(0, 1_000)).toBe(2_000);
  });
});

describe('pullPolicy', () => {
  it('rechaza un pull truncado antes de avanzar el cursor local', () => {
    expect(() => assertPullIsComplete({ truncated: true } as PullPayload, 2000))
      .toThrow(/2000 negocios/i);
    expect(() => assertPullIsComplete({ truncated: false } as PullPayload, 2000))
      .not.toThrow();
  });
});

describe('conflictPolicy', () => {
  it('marca conflicto cuando el documento pertenece a otro id', () => {
    const result = resolveCustomerIdNumberConflict({
      localId: 'local-1',
      idNumber: '123',
      existing: { id: 'server-9', name: 'Ana' },
    });
    expect(result.status).toBe('conflict');
    expect(result.conflict?.existingId).toBe('server-9');
  });

  it('no marca conflicto si el id coincide', () => {
    expect(
      resolveCustomerIdNumberConflict({
        localId: 'same',
        idNumber: '123',
        existing: { id: 'same', name: 'Ana' },
      }).status
    ).toBe('ok');
  });
});

describe('sessionPolicy', () => {
  it('permite sesión offline dentro del TTL', () => {
    const now = 1_000_000;
    expect(isOfflineSessionValid(now - 1000, now)).toBe(true);
    expect(isOfflineSessionValid(now - 8 * 24 * 60 * 60 * 1000, now)).toBe(false);
    expect(isOfflineSessionValid(null, now)).toBe(false);
  });

  it('bloquea tras gracia en background', () => {
    expect(shouldLockApp(1_000, 1_000 + 2 * 60 * 1000)).toBe(true);
    expect(shouldLockApp(1_000, 1_000 + 30_000)).toBe(false);
  });

  it('detecta errores de red', () => {
    expect(isNetworkError(new Error('Network request failed'))).toBe(true);
    expect(isNetworkError(new Error('Sin permiso'))).toBe(false);
  });

  it('detecta AuthSessionMissing y refresh token inválido', () => {
    const missing = new Error('Auth session missing!');
    missing.name = 'AuthSessionMissingError';
    expect(isAuthSessionMissingError(missing)).toBe(true);
    expect(isAuthSessionMissingError(new Error('Auth session missing!'))).toBe(true);
    expect(isInvalidRefreshTokenError(new Error('Invalid Refresh Token'))).toBe(true);
    expect(isInvalidRefreshTokenError(new Error('Network request failed'))).toBe(false);
  });

  it('conserva sesión local solo con error de red y TTL vigente', () => {
    const now = 1_000_000;
    const lastVerified = now - 1000;
    expect(shouldKeepLocalSession({
      error: new Error('Network request failed'),
      hasStoredSession: true,
      lastOnlineVerifiedAt: lastVerified,
      now,
    })).toBe(true);

    const missing = new Error('Auth session missing!');
    missing.name = 'AuthSessionMissingError';
    expect(shouldKeepLocalSession({
      error: missing,
      hasStoredSession: true,
      lastOnlineVerifiedAt: lastVerified,
      now,
    })).toBe(false);

    expect(shouldKeepLocalSession({
      error: new Error('Invalid Refresh Token'),
      hasStoredSession: true,
      lastOnlineVerifiedAt: lastVerified,
      now,
    })).toBe(false);

    expect(shouldKeepLocalSession({
      error: new Error('Network request failed'),
      hasStoredSession: false,
      lastOnlineVerifiedAt: lastVerified,
      now,
    })).toBe(false);
  });
});
