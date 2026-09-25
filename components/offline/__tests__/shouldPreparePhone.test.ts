import { PREPARE_PHONE_AFTER_MS, shouldPreparePhone } from '../SyncStatusBanner';

jest.mock('@/lib/offline/sync/syncEngine', () => ({ runSync: jest.fn() }));
jest.mock('@/lib/supabase', () => ({ supabase: { rpc: jest.fn() } }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

const NOW = Date.parse('2026-09-25T12:00:00Z');

describe('shouldPreparePhone', () => {
  it('primer inicio de sesión: invita a preparar el teléfono (no descarga sola)', () => {
    expect(shouldPreparePhone({ loggedIn: true, lastDownloadAt: null, pendingDownload: false, now: NOW })).toBe('first');
  });

  it('sin sesión no avisa', () => {
    expect(shouldPreparePhone({ loggedIn: false, lastDownloadAt: null, pendingDownload: true, now: NOW })).toBeNull();
  });

  it('avisa si hay elecciones pendientes de descargar', () => {
    expect(shouldPreparePhone({ loggedIn: true, lastDownloadAt: NOW - 1000, pendingDownload: true, now: NOW })).toBe(
      'pending'
    );
  });

  it('avisa si la última descarga tiene más de 24 h', () => {
    expect(
      shouldPreparePhone({
        loggedIn: true,
        lastDownloadAt: NOW - PREPARE_PHONE_AFTER_MS - 1,
        pendingDownload: false,
        now: NOW,
      })
    ).toBe('stale');
  });

  it('no avisa con descarga reciente y nada pendiente', () => {
    expect(shouldPreparePhone({ loggedIn: true, lastDownloadAt: NOW - 1000, pendingDownload: false, now: NOW })).toBeNull();
  });
});
