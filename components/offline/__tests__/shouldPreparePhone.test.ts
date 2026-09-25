import { PREPARE_PHONE_AFTER_MS, shouldPreparePhone } from '../SyncStatusBanner';
import { defaultDomainConfig, type SyncConfig } from '../infrastructure/syncPrefsService';

jest.mock('@/lib/offline/sync/syncEngine', () => ({ runSync: jest.fn() }));
jest.mock('@/lib/supabase', () => ({ supabase: { rpc: jest.fn() } }));

const NOW = Date.parse('2026-09-25T12:00:00Z');

function config(overrides: Partial<SyncConfig> = {}): SyncConfig {
  return {
    clientes: defaultDomainConfig('clientes'),
    productos: defaultDomainConfig('productos'),
    ordenes: defaultDomainConfig('ordenes'),
    ...overrides,
  };
}

describe('shouldPreparePhone', () => {
  it('avisa si la última descarga tiene más de 24 h', () => {
    expect(
      shouldPreparePhone({
        lastSyncedAt: NOW - PREPARE_PHONE_AFTER_MS - 1,
        prefsReady: false,
        config: config(),
        markable: [],
        now: NOW,
      })
    ).toBe(true);
  });

  it('avisa si un dominio marcable está en selección sin nada llevado', () => {
    const input = {
      lastSyncedAt: NOW - 1000,
      prefsReady: true,
      config: config({ productos: { mode: 'seleccion', revision: 1, count: 0, ids: [] } }),
      now: NOW,
    };
    expect(shouldPreparePhone({ ...input, markable: ['clientes', 'productos'] })).toBe(true);
    // Un gestor de cobro no marca: no se le deja un aviso que no puede apagar.
    expect(shouldPreparePhone({ ...input, markable: [] })).toBe(false);
  });

  it('no avisa con descarga reciente y todo en modo «Todo»', () => {
    expect(
      shouldPreparePhone({
        lastSyncedAt: NOW - 1000,
        prefsReady: true,
        config: config(),
        markable: ['clientes', 'productos'],
        now: NOW,
      })
    ).toBe(false);
  });
});
