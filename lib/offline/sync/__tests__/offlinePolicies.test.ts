import { classifyPushError, nextRetryAt, canRetry, OUTBOX_MAX_ATTEMPTS } from '../retryPolicy';
import { resolveCustomerIdNumberConflict } from '../conflictPolicy';
import {
  isAuthSessionMissingError,
  isInvalidRefreshTokenError,
  isNetworkError,
  isOfflineSessionValid,
  shouldKeepLocalSession,
  shouldLockApp,
} from '../../security/sessionPolicy';
import { pullTruncationWarning, type PullPayload } from '../types';

describe('retryPolicy', () => {
  it('clasifica errores de negocio vs red', () => {
    expect(classifyPushError('El valor supera el saldo')).toBe('fail');
    expect(classifyPushError('Sin permiso sobre este negocio')).toBe('fail');
    expect(classifyPushError('Solo puede cobrarse la parada actual')).toBe('fail');
    expect(classifyPushError('Negocio no encontrado')).toBe('fail');
    expect(classifyPushError('Solo un administrador puede aprobar la orden de compra OC-2026-0009.')).toBe('fail');
    expect(
      classifyPushError(
        'La orden de compra OC-2026-0009 está aprobada: la devolución no se puede revertir. Si necesita ingresar la mercancía de nuevo, cree una nueva orden de compra.'
      )
    ).toBe('fail');
    expect(classifyPushError('La ruta no está disponible para iniciar')).toBe('fail');
    expect(
      classifyPushError('Seleccione el método de pago. Si usa la app móvil, actualícela a la última versión.')
    ).toBe('fail');
    expect(
      classifyPushError(
        'Las salidas sin orden de entrega solo las registra un administrador. Registre la salida contra una orden de entrega.'
      )
    ).toBe('fail');
    expect(
      classifyPushError(
        'El negocio 2026001 está Activo: solo se pueden editar la dirección, las notas y el gestor de cobro. Para cambiar productos, precios, cuotas o cliente, un administrador debe anularlo y crear uno nuevo.'
      )
    ).toBe('fail');
    expect(classifyPushError('El negocio 2026004 está Anulado: no se puede editar.')).toBe('fail');
    expect(classifyPushError('Ya existe un cliente con documento')).toBe('conflict');
    expect(classifyPushError('La clave de idempotencia ya fue usada con datos diferentes')).toBe('conflict');
    expect(classifyPushError('Network request failed')).toBe('network');
    expect(classifyPushError('TypeError: Failed to fetch')).toBe('network');
    expect(classifyPushError('getSession timeout')).toBe('network');
    // Lo contestó el servidor (Postgres canceló la consulta): no es falta de
    // señal, es un error transitorio que consume intentos.
    expect(classifyPushError('canceling statement due to statement timeout')).toBe('retry');
    expect(classifyPushError('unexpected server error')).toBe('retry');
  });

  it('no reintenta indefinidamente', () => {
    expect(canRetry('error', OUTBOX_MAX_ATTEMPTS, Date.now() - 1)).toBe(false);
    expect(canRetry('pending', 0, Date.now() - 1)).toBe(true);
    expect(nextRetryAt(0, 1_000)).toBe(2_000);
  });

  /**
   * Un servidor caído un rato no puede dar por perdido un cobro real: el
   * cliente ya se llevó el recibo impreso. Los errores transitorios tienen que
   * insistir muchas veces y durante horas antes de pedir ayuda a la persona.
   */
  it('un error de envío no se vuelve terminal a la primera', () => {
    expect(classifyPushError('unexpected server error')).toBe('retry');
    expect(classifyPushError('502 Bad Gateway')).toBe('retry');
    expect(canRetry('error', 1, Date.now() - 1)).toBe(true);
    expect(canRetry('error', 8, Date.now() - 1)).toBe(true);
    expect(OUTBOX_MAX_ATTEMPTS).toBeGreaterThanOrEqual(20);
    // El último escalón de espera llega a una hora: la cola insiste medio día.
    expect(nextRetryAt(OUTBOX_MAX_ATTEMPTS - 1, 0)).toBe(3_600_000);
  });

  it('un corte por tiempo límite del cliente cuenta como falta de red', () => {
    // `createTimeoutFetch` (lib/supabase.ts) traduce el AbortError a este texto.
    expect(classifyPushError('La red no respondió a tiempo.')).toBe('network');
    expect(classifyPushError('Aborted')).toBe('network');
  });
});

describe('pullPolicy', () => {
  it('un pull truncado ya no se descarta: devuelve un aviso y se aplica igual', () => {
    // Antes esto lanzaba y el paquete entero se tiraba: el teléfono se quedaba
    // sin nada, que es peor que quedarse con datos incompletos.
    expect(pullTruncationWarning({ truncated: true } as PullPayload, 2000)).toMatch(/2000 negocios/i);
    expect(pullTruncationWarning({ truncated: false } as PullPayload, 2000)).toBeNull();
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
