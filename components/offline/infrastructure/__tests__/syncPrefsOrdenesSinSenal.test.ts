import { renderHook, waitFor } from '@testing-library/react-native';
import { supabase } from '@/lib/supabase';
import { useSyncStore } from '@/lib/offline/store/syncStore';
import { loadSyncPrefs, resetSyncPrefs, useOfflineSelection, useSyncPrefsStore } from '../syncPrefsService';

/**
 * Sin señal no se puede preguntar al servidor qué órdenes marcó la persona.
 * Antes la marca quedaba vacía: una orden ya descargada se veía sin
 * «En el teléfono» y ofrecía «Llevar en el teléfono» como si faltara. Las
 * órdenes que bajaron en la última descarga son justamente las marcadas.
 */

jest.mock('@/lib/supabase', () => ({ supabase: { rpc: jest.fn(), from: jest.fn() } }));
jest.mock('@/lib/offline/sync/syncEngine', () => ({ runSync: jest.fn(async () => undefined) }));
jest.mock('@/lib/offline/sync/syncPrefs', () => ({
  getLocalSyncConfig: jest.fn(async () => null),
  isSelectiveSyncSupported: jest.fn(async () => false),
  lastManualDownloadAt: jest.fn(async () => null),
  markChoicesChangedLocally: jest.fn(async () => undefined),
  hasPendingChoicesToDownload: jest.fn(async () => false),
}));
jest.mock('@/lib/offline/database', () => ({ isDatabaseOpen: jest.fn(() => true) }));
jest.mock('@/lib/offline/repositories/deliveryOrdersRepository', () => ({
  listLocalOfflineOrders: jest.fn(async () => [{ id: 'rem-1' }, { id: 'oe-7' }]),
}));

const rpc = supabase.rpc as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  resetSyncPrefs();
  useSyncStore.setState({ online: true });
});

describe('Marca «En el teléfono» sin señal', () => {
  it('las órdenes descargadas cuentan como marcadas aunque el servidor no responda', async () => {
    rpc.mockRejectedValue(new Error('Network request failed'));
    await loadSyncPrefs();

    const state = useSyncPrefsStore.getState();
    expect(state.status).toBe('offline');
    expect(state.config.ordenes.ids).toEqual(['rem-1', 'oe-7']);

    const { result } = renderHook(() => useOfflineSelection('ordenes'));
    await waitFor(() => expect(result.current.isSelected('rem-1')).toBe(true));
    expect(result.current.isSelected('otra')).toBe(false);
    expect(result.current.supported).toBe(true);
  });

  it('con señal manda la marca del servidor', async () => {
    rpc.mockResolvedValue({ data: { ordenes: { revision: 2, count: 1, ids: ['oe-7'] } }, error: null });
    await loadSyncPrefs();
    expect(useSyncPrefsStore.getState().config.ordenes.ids).toEqual(['oe-7']);
  });
});
