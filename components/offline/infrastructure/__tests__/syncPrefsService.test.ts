import { act, renderHook } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { supabase } from '@/lib/supabase';
import { runSync } from '@/lib/offline/sync/syncEngine';
import { getLocalSyncConfig, lastManualDownloadAt } from '@/lib/offline/sync/syncPrefs';
import { useSyncStore } from '@/lib/offline/store/syncStore';
import {
  getSyncConfig,
  isDownloadPending,
  loadSyncPrefs,
  refreshDownloadState,
  parseSyncConfig,
  resetSyncPrefs,
  setSyncMode,
  setSyncSelection,
  useOfflineSelection,
  useSyncPrefsStore,
} from '../syncPrefsService';

jest.mock('@/lib/supabase', () => ({ supabase: { rpc: jest.fn(), from: jest.fn() } }));
jest.mock('@/lib/offline/sync/syncEngine', () => ({ runSync: jest.fn(async () => undefined) }));
jest.mock('@/lib/offline/sync/syncPrefs', () => ({
  getLocalSyncConfig: jest.fn(async () => null),
  isSelectiveSyncSupported: jest.fn(async () => false),
  lastManualDownloadAt: jest.fn(async () => null),
}));
jest.mock('@/lib/offline/database', () => ({ isDatabaseOpen: jest.fn(() => true) }));

const rpc = supabase.rpc as unknown as jest.Mock;
const mockedRunSync = runSync as jest.MockedFunction<typeof runSync>;
const mockedManualAt = lastManualDownloadAt as jest.MockedFunction<typeof lastManualDownloadAt>;
const mockedLocal = getLocalSyncConfig as jest.MockedFunction<typeof getLocalSyncConfig>;

const CONFIG = {
  clientes: { mode: 'seleccion', revision: 3, count: 2, ids: ['c1', 'c2'] },
  productos: { mode: 'todo', revision: 1, count: 0 },
  ordenes: { revision: 5, count: 1, ids: ['o1'] },
};

beforeEach(() => {
  jest.clearAllMocks();
  resetSyncPrefs();
  useSyncStore.setState({ online: true });
  mockedManualAt.mockResolvedValue(null);
  mockedLocal.mockResolvedValue(null);
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});

describe('parseSyncConfig', () => {
  it('lee modo, revisión, conteo e ids; órdenes siempre en selección', () => {
    const config = parseSyncConfig(CONFIG);
    expect(config.clientes).toEqual({ mode: 'seleccion', revision: 3, count: 2, ids: ['c1', 'c2'] });
    expect(config.productos).toEqual({ mode: 'todo', revision: 1, count: 0, ids: [] });
    expect(config.ordenes.mode).toBe('seleccion');
    expect(config.ordenes.ids).toEqual(['o1']);
  });

  it('acepta los ids aparte, en `selected`', () => {
    const config = parseSyncConfig({
      clientes: { mode: 'seleccion', revision: 1, count: 1 },
      selected: { clientes: ['c9'] },
    });
    expect(config.clientes.ids).toEqual(['c9']);
  });
});

describe('getSyncConfig', () => {
  it('pide los ids con list_mobile_sync_selection si solo llegó el conteo', async () => {
    rpc.mockImplementation(async (fn: string) => {
      if (fn === 'get_mobile_sync_config') {
        return { data: { ...CONFIG, productos: { mode: 'seleccion', revision: 2, count: 2 } }, error: null };
      }
      if (fn === 'list_mobile_sync_selection') {
        return { data: [{ entity_id: 'p1', name: 'Silla' }, { entity_id: 'p2', name: 'Mesa' }], error: null };
      }
      return { data: null, error: null };
    });

    const config = await getSyncConfig();

    expect(rpc).toHaveBeenCalledWith('list_mobile_sync_selection', { p_domain: 'productos', p_limit: 200, p_offset: 0 });
    expect(config.productos.ids).toEqual(['p1', 'p2']);
    expect(useSyncPrefsStore.getState().status).toBe('ready');
  });
});

describe('loadSyncPrefs', () => {
  it('queda sin soporte si el servidor no tiene los RPC (PGRST202)', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } });
    await loadSyncPrefs();
    expect(useSyncPrefsStore.getState().status).toBe('unsupported');
  });

  it('con los RPC en el servidor la pantalla está disponible antes de la primera descarga', async () => {
    // isSelectiveSyncSupported() es false hasta el primer pull con p_options;
    // con la descarga solo manual no puede decidir si se muestra la pantalla.
    rpc.mockResolvedValue({ data: CONFIG, error: null });
    await loadSyncPrefs();
    expect(useSyncPrefsStore.getState().status).toBe('ready');
  });

  it('sin señal usa el modo que guardó el último pull', async () => {
    rpc.mockRejectedValue(new Error('Network request failed'));
    mockedLocal.mockResolvedValue({
      clientes: { mode: 'seleccion', revision: 2 },
      productos: { mode: 'todo', revision: 1 },
      ordenes: { revision: 1 },
    });
    await loadSyncPrefs();
    const state = useSyncPrefsStore.getState();
    expect(state.status).toBe('offline');
    expect(state.config.clientes.mode).toBe('seleccion');
  });
});

describe('setSyncMode / setSyncSelection', () => {
  it('cambia el modo sin descargar: queda pendiente de descargar', async () => {
    rpc.mockResolvedValue({ data: { domain: 'clientes', revision: 7 }, error: null });
    await setSyncMode('clientes', 'seleccion');
    expect(rpc).toHaveBeenCalledWith('set_mobile_sync_mode', { p_domain: 'clientes', p_mode: 'seleccion' });
    expect(useSyncPrefsStore.getState().config.clientes).toMatchObject({ mode: 'seleccion', revision: 7 });
    expect(mockedRunSync).not.toHaveBeenCalled();
    expect(isDownloadPending(useSyncPrefsStore.getState())).toBe(true);
  });

  it('productos acepta «ninguno»', async () => {
    rpc.mockResolvedValue({ data: { domain: 'productos', revision: 2 }, error: null });
    await setSyncMode('productos', 'ninguno');
    expect(rpc).toHaveBeenCalledWith('set_mobile_sync_mode', { p_domain: 'productos', p_mode: 'ninguno' });
    expect(useSyncPrefsStore.getState().config.productos.mode).toBe('ninguno');
  });

  it('el pendiente se apaga tras una descarga manual posterior al cambio', async () => {
    rpc.mockResolvedValue({ data: { domain: 'municipios', count: 1, revision: 1 }, error: null });
    await setSyncSelection('municipios', ['m1'], true);
    expect(isDownloadPending(useSyncPrefsStore.getState())).toBe(true);

    mockedManualAt.mockResolvedValue(Date.now() + 1000);
    await refreshDownloadState();
    expect(isDownloadPending(useSyncPrefsStore.getState())).toBe(false);
    expect(useSyncPrefsStore.getState().config.municipios.ids).toEqual(['m1']);
  });

  it('parte los lotes en 200 ids y guarda el conteo del servidor', async () => {
    useSyncPrefsStore.setState({
      config: { ...useSyncPrefsStore.getState().config, clientes: { mode: 'seleccion', revision: 1, count: 0, ids: [] } },
    });
    let total = 0;
    rpc.mockImplementation(async (_fn: string, args: { p_ids: string[] }) => {
      total += args.p_ids.length;
      return { data: { domain: 'clientes', count: total, revision: 1 }, error: null };
    });
    const ids = Array.from({ length: 450 }, (_, index) => `c${index}`);

    const result = await setSyncSelection('clientes', ids, true);

    expect(rpc).toHaveBeenCalledTimes(3);
    expect(rpc.mock.calls[0][1].p_ids).toHaveLength(200);
    expect(rpc.mock.calls[2][1].p_ids).toHaveLength(50);
    expect(result.count).toBe(450);
    expect(useSyncPrefsStore.getState().config.clientes.ids).toHaveLength(450);
    expect(mockedRunSync).not.toHaveBeenCalled();
  });

  it('propaga el mensaje del tope y no marca pendiente si nada se aplicó', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'P0001', message: 'Puedes llevar hasta 100 órdenes' } });
    await expect(setSyncSelection('ordenes', ['o2'], true)).rejects.toThrow('Puedes llevar hasta 100 órdenes');
    expect(isDownloadPending(useSyncPrefsStore.getState())).toBe(false);
  });
});

describe('useOfflineSelection', () => {
  beforeEach(() => {
    rpc.mockImplementation(async (fn: string, args?: { p_ids?: string[]; p_selected?: boolean }) => {
      if (fn === 'get_mobile_sync_config') return { data: CONFIG, error: null };
      if (fn === 'set_mobile_sync_selection') {
        return { data: { domain: 'clientes', count: args?.p_selected ? 3 : 1, revision: 4 }, error: null };
      }
      return { data: null, error: null };
    });
  });

  it('expone modo, conteo y marca; toggle marca y desmarca', async () => {
    const { result } = renderHook(() => useOfflineSelection('clientes'));
    await act(async () => {
      await loadSyncPrefs();
    });

    expect(result.current.supported).toBe(true);
    expect(result.current.mode).toBe('seleccion');
    expect(result.current.count).toBe(2);
    expect(result.current.isSelected('c1')).toBe(true);
    expect(result.current.isSelected('c3')).toBe(false);

    await act(async () => {
      await result.current.toggle('c3');
    });
    expect(rpc).toHaveBeenCalledWith('set_mobile_sync_selection', {
      p_domain: 'clientes',
      p_ids: ['c3'],
      p_selected: true,
    });
    expect(result.current.isSelected('c3')).toBe(true);
    expect(result.current.count).toBe(3);
    expect(result.current.pendingDownload).toBe(true);
    expect(mockedRunSync).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.toggle('c1');
    });
    expect(rpc).toHaveBeenLastCalledWith('set_mobile_sync_selection', {
      p_domain: 'clientes',
      p_ids: ['c1'],
      p_selected: false,
    });
    expect(result.current.isSelected('c1')).toBe(false);
  });

  it('sin señal no llama al servidor y lo avisa', async () => {
    const { result } = renderHook(() => useOfflineSelection('clientes'));
    await act(async () => {
      await loadSyncPrefs();
    });
    useSyncStore.setState({ online: false });

    let applied = true;
    await act(async () => {
      applied = await result.current.toggle('c3');
    });

    expect(applied).toBe(false);
    expect(Alert.alert).toHaveBeenCalledWith('Sin conexión', 'Necesitas señal para llevar o quitar del teléfono.');
    expect(rpc).not.toHaveBeenCalledWith('set_mobile_sync_selection', expect.anything());
  });

  it('supported=false si el servidor no tiene los RPC', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } });
    const { result } = renderHook(() => useOfflineSelection('ordenes'));
    await act(async () => {
      await loadSyncPrefs();
    });
    expect(result.current.supported).toBe(false);
  });
});

describe('estado compartido', () => {
  it('muchas tarjetas con el hook hacen una sola llamada a get_mobile_sync_config', async () => {
    rpc.mockResolvedValue({ data: CONFIG, error: null });
    const hooks = Array.from({ length: 20 }, () => renderHook(() => useOfflineSelection('clientes')));
    await act(async () => {
      await loadSyncPrefs();
    });
    // Tarjetas montadas después (al hacer scroll) tampoco vuelven a preguntar.
    renderHook(() => useOfflineSelection('clientes'));
    await act(async () => undefined);

    const configCalls = rpc.mock.calls.filter(([fn]) => fn === 'get_mobile_sync_config');
    expect(configCalls).toHaveLength(1);
    expect(hooks[19].result.current.isSelected('c1')).toBe(true);
  });
});
