import { act, renderHook } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { supabase } from '@/lib/supabase';
import { runSync } from '@/lib/offline/sync/syncEngine';
import {
  getLocalSyncConfig,
  hasPendingChoicesToDownload,
  lastManualDownloadAt,
  markChoicesChangedLocally,
} from '@/lib/offline/sync/syncPrefs';
import { useSyncStore } from '@/lib/offline/store/syncStore';
import {
  getSyncConfig,
  isDownloadPending,
  loadSyncPrefs,
  refreshDownloadState,
  parseConfigMeta,
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
  markChoicesChangedLocally: jest.fn(async () => undefined),
  hasPendingChoicesToDownload: jest.fn(async () => false),
}));
jest.mock('@/lib/offline/database', () => ({ isDatabaseOpen: jest.fn(() => true) }));

const rpc = supabase.rpc as unknown as jest.Mock;
const mockedRunSync = runSync as jest.MockedFunction<typeof runSync>;
const mockedManualAt = lastManualDownloadAt as jest.MockedFunction<typeof lastManualDownloadAt>;
const mockedPending = hasPendingChoicesToDownload as jest.MockedFunction<typeof hasPendingChoicesToDownload>;
const mockedMarkChanged = markChoicesChangedLocally as jest.MockedFunction<typeof markChoicesChangedLocally>;
const mockedLocal = getLocalSyncConfig as jest.MockedFunction<typeof getLocalSyncConfig>;


// v3 (20261205120000): el servidor manda clientes siempre en 'todo' sin ids.
const CONFIG = {
  clientes: { mode: 'todo', revision: 3, count: 0, ids: [], mis_clientes: false },
  municipios: { revision: 3, count: 0, ids: [] },
  productos: { mode: 'todo', revision: 1 },
  ordenes: { revision: 5, count: 2, ids: ['o1', 'o2'] },
};

beforeEach(() => {
  jest.clearAllMocks();
  resetSyncPrefs();
  useSyncStore.setState({ online: true });
  mockedManualAt.mockResolvedValue(null);
  mockedPending.mockResolvedValue(false);
  mockedLocal.mockResolvedValue(null);
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});

describe('parseSyncConfig', () => {
  it('lee productos (modo) y órdenes (revisión, conteo e ids); clientes ya no es preferencia', () => {
    const config = parseSyncConfig(CONFIG);
    expect(config).toEqual({
      productos: { mode: 'todo', revision: 1, count: 0, ids: [] },
      ordenes: { mode: 'seleccion', revision: 5, count: 2, ids: ['o1', 'o2'] },
    });
  });

  it('acepta los ids aparte, en `selected`', () => {
    const config = parseSyncConfig({ ordenes: { revision: 1, count: 1 }, selected: { ordenes: ['o9'] } });
    expect(config.ordenes.ids).toEqual(['o9']);
  });

  it('productos en «ninguno»', () => {
    expect(parseSyncConfig({ productos: { mode: 'ninguno', revision: 2 } }).productos.mode).toBe('ninguno');
  });
});

describe('parseConfigMeta', () => {
  it('lee el estimado exacto y los permisos', () => {
    expect(
      parseConfigMeta({
        clientes: { mode: 'todo', mis_clientes: false },
        estimated: { clientes: 340, negocios: 22 },
        orders_allowed: false,
        catalog_allowed: true,
      })
    ).toEqual({ estimated: { clientes: 340, negocios: 22 }, ordersAllowed: false, catalogAllowed: true });
  });
});

describe('getSyncConfig', () => {
  it('pide los ids de órdenes con list_mobile_sync_selection si solo llegó el conteo', async () => {
    rpc.mockImplementation(async (fn: string) => {
      if (fn === 'get_mobile_sync_config') {
        return { data: { ...CONFIG, ordenes: { revision: 2, count: 2 } }, error: null };
      }
      if (fn === 'list_mobile_sync_selection') {
        return { data: [{ entity_id: 'o7', name: 'OE-7' }, { entity_id: 'o8', name: 'OE-8' }], error: null };
      }
      return { data: null, error: null };
    });

    const config = await getSyncConfig();

    expect(rpc).toHaveBeenCalledWith('list_mobile_sync_selection', { p_domain: 'ordenes', p_limit: 200, p_offset: 0 });
    expect(rpc).not.toHaveBeenCalledWith('list_mobile_sync_selection', expect.objectContaining({ p_domain: 'clientes' }));
    expect(config.ordenes.ids).toEqual(['o7', 'o8']);
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

  it('sin señal usa el modo de productos que guardó el último pull', async () => {
    rpc.mockRejectedValue(new Error('Network request failed'));
    mockedLocal.mockResolvedValue({
      clientes: { mode: 'todo', revision: 2, count: null },
      productos: { mode: 'ninguno', revision: 1, count: null },
      ordenes: { revision: 1, count: null },
    });
    await loadSyncPrefs();
    const state = useSyncPrefsStore.getState();
    expect(state.status).toBe('offline');
    expect(state.config.productos.mode).toBe('ninguno');
  });
});

describe('setSyncMode / setSyncSelection', () => {
  it('productos acepta «ninguno» sin descargar: queda pendiente de descargar', async () => {
    rpc.mockResolvedValue({ data: { domain: 'productos', revision: 2 }, error: null });
    await setSyncMode('productos', 'ninguno');
    expect(rpc).toHaveBeenCalledWith('set_mobile_sync_mode', { p_domain: 'productos', p_mode: 'ninguno' });
    expect(useSyncPrefsStore.getState().config.productos).toMatchObject({ mode: 'ninguno', revision: 2 });
    expect(mockedRunSync).not.toHaveBeenCalled();
    expect(isDownloadPending(useSyncPrefsStore.getState())).toBe(true);
  });

  it('las órdenes no tienen modo', async () => {
    await expect(setSyncMode('ordenes', 'todo')).rejects.toThrow('Este dominio siempre se elige uno a uno.');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('pasa al motor la configuración leída del servidor para detectar cambios de otro teléfono', async () => {
    rpc.mockResolvedValue({ data: CONFIG, error: null });
    mockedPending.mockResolvedValue(true);
    await loadSyncPrefs();
    await refreshDownloadState();
    expect(mockedPending).toHaveBeenCalledWith(CONFIG);
    expect(isDownloadPending(useSyncPrefsStore.getState())).toBe(true);
  });

  it('el pendiente se apaga tras una descarga manual posterior al cambio', async () => {
    rpc.mockResolvedValue({ data: { domain: 'ordenes', count: 1, revision: 1 }, error: null });
    await setSyncSelection('ordenes', ['o1'], true);
    expect(isDownloadPending(useSyncPrefsStore.getState())).toBe(true);
    expect(mockedMarkChanged).toHaveBeenCalledTimes(1);

    // Tras «Descargar» el motor ya no ve cambios pendientes.
    mockedManualAt.mockResolvedValue(Date.now() + 1000);
    mockedPending.mockResolvedValue(false);
    await refreshDownloadState();
    expect(isDownloadPending(useSyncPrefsStore.getState())).toBe(false);
    expect(useSyncPrefsStore.getState().lastManualAt).not.toBeNull();
    expect(useSyncPrefsStore.getState().config.ordenes.ids).toEqual(['o1']);
  });

  it('parte los lotes en 200 ids y guarda el conteo del servidor', async () => {
    let total = 0;
    rpc.mockImplementation(async (_fn: string, args: { p_ids: string[] }) => {
      total += args.p_ids.length;
      return { data: { domain: 'ordenes', count: total, revision: 1 }, error: null };
    });
    const ids = Array.from({ length: 450 }, (_, index) => `o${index}`);

    const result = await setSyncSelection('ordenes', ids, true);

    const setCalls = rpc.mock.calls.filter(([fn]) => fn === 'set_mobile_sync_selection');
    expect(setCalls).toHaveLength(3);
    expect(setCalls[0][1].p_ids).toHaveLength(200);
    expect(setCalls[2][1].p_ids).toHaveLength(50);
    expect(result.count).toBe(450);
    expect(useSyncPrefsStore.getState().config.ordenes.ids).toHaveLength(450);
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
        return { data: { domain: 'ordenes', count: args?.p_selected ? 3 : 1, revision: 4 }, error: null };
      }
      return { data: null, error: null };
    });
  });

  it('expone modo, conteo y marca; toggle marca y desmarca', async () => {
    const { result } = renderHook(() => useOfflineSelection('ordenes'));
    await act(async () => {
      await loadSyncPrefs();
    });

    expect(result.current.supported).toBe(true);
    expect(result.current.mode).toBe('seleccion');
    expect(result.current.count).toBe(2);
    expect(result.current.isSelected('o1')).toBe(true);
    expect(result.current.isSelected('o3')).toBe(false);

    await act(async () => {
      await result.current.toggle('o3');
    });
    expect(rpc).toHaveBeenCalledWith('set_mobile_sync_selection', {
      p_domain: 'ordenes',
      p_ids: ['o3'],
      p_selected: true,
    });
    expect(result.current.isSelected('o3')).toBe(true);
    expect(result.current.count).toBe(3);
    expect(result.current.pendingDownload).toBe(true);
    expect(mockedRunSync).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.toggle('o1');
    });
    expect(rpc).toHaveBeenCalledWith('set_mobile_sync_selection', {
      p_domain: 'ordenes',
      p_ids: ['o1'],
      p_selected: false,
    });
    expect(result.current.isSelected('o1')).toBe(false);
  });

  it('productos no se marca uno a uno: toggle no llama al servidor', async () => {
    const { result } = renderHook(() => useOfflineSelection('productos'));
    await act(async () => {
      await loadSyncPrefs();
    });
    let applied = true;
    await act(async () => {
      applied = await result.current.toggle('p1');
    });
    expect(applied).toBe(false);
    expect(rpc).not.toHaveBeenCalledWith('set_mobile_sync_selection', expect.anything());
    expect(result.current.mode).toBe('todo');
  });

  it('sin señal no llama al servidor y lo avisa', async () => {
    const { result } = renderHook(() => useOfflineSelection('ordenes'));
    await act(async () => {
      await loadSyncPrefs();
    });
    useSyncStore.setState({ online: false });

    let applied = true;
    await act(async () => {
      applied = await result.current.toggle('o3');
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
    const hooks = Array.from({ length: 20 }, () => renderHook(() => useOfflineSelection('ordenes')));
    await act(async () => {
      await loadSyncPrefs();
    });
    // Tarjetas montadas después (al hacer scroll) tampoco vuelven a preguntar.
    renderHook(() => useOfflineSelection('ordenes'));
    await act(async () => undefined);

    const configCalls = rpc.mock.calls.filter(([fn]) => fn === 'get_mobile_sync_config');
    expect(configCalls).toHaveLength(1);
    expect(hooks[19].result.current.isSelected('o1')).toBe(true);
  });
});
