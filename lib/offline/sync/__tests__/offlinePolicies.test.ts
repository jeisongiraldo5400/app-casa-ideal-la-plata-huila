import { classifyPushError, nextRetryAt, canRetry } from '../retryPolicy';
import { resolveCustomerIdNumberConflict } from '../conflictPolicy';
import { isOfflineSessionValid, isNetworkError, shouldLockApp } from '../../security/sessionPolicy';

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
});
