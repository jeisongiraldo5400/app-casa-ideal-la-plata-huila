import { supabase } from '@/lib/supabase';
import { enqueueRouteCommand, fetchRouteFromLocal, fetchRoutesFromLocal } from '@/lib/offline/repositories/offlineRepository';
import {
  fetchRouteCandidatesFromLocal,
  readRouteLocalSnapshot,
  saveRouteCopyLocally,
} from '@/lib/offline/repositories/routesRepository';
import { requestManualDownload } from '@/lib/offline/sync/downloadData';
import { lastManualDownloadAt } from '@/lib/offline/sync/syncPrefs';
import { getCachedActiveRoute } from '../routeCache';
import {
  downloadRouteForOffline,
  fetchAllRouteCandidates,
  fetchCollectionRoute,
  fetchMyCollectionRoutes,
  fetchRouteCandidates,
  finishCollectionRoute,
  finishRouteRpcArgs,
  setCollectionRouteStops,
  selectCollectionRouteStop,
  startCollectionRoute,
  updateCollectionRouteStop,
  withCachedActiveRoute,
} from '../collectionRouteService';
import { useSyncStore } from '@/lib/offline/store/syncStore';
import { EMPTY_ROUTE_LOCATION_FILTER, type CandidateQuery, type CollectionRoute } from '../types';

jest.mock('@/lib/supabase', () => ({ supabase: { rpc: jest.fn() } }));
jest.mock('@/lib/offline/repositories/offlineRepository', () => ({
  enqueueRouteCommand: jest.fn(),
  fetchRouteFromLocal: jest.fn(),
  fetchRoutesFromLocal: jest.fn(),
}));
jest.mock('@/lib/offline/repositories/routesRepository', () => ({
  fetchRouteCandidatesFromLocal: jest.fn(),
  readRouteLocalSnapshot: jest.fn(),
  saveRouteCopyLocally: jest.fn(),
}));
jest.mock('@/lib/offline/sync/downloadData', () => ({ requestManualDownload: jest.fn(), formatLastDownloadTime: () => '9:05 a. m.' }));
jest.mock('@/lib/offline/sync/syncPrefs', () => ({ lastManualDownloadAt: jest.fn() }));
jest.mock('../routeCache', () => ({ cacheActiveRoute: jest.fn(), getCachedActiveRoute: jest.fn() }));

const rpc = supabase.rpc as unknown as jest.Mock;
const localCandidates = fetchRouteCandidatesFromLocal as jest.Mock;
const snapshot = readRouteLocalSnapshot as jest.Mock;
const saveCopy = saveRouteCopyLocally as jest.Mock;
const download = requestManualDownload as jest.Mock;
const downloadedAt = lastManualDownloadAt as jest.Mock;
const localRoutes = fetchRoutesFromLocal as jest.Mock;
const localRoute = fetchRouteFromLocal as jest.Mock;
const cached = getCachedActiveRoute as jest.Mock;

const QUERY: CandidateQuery = {
  search: 'pena',
  filter: 'al_dia',
  location: { ...EMPTY_ROUTE_LOCATION_FILTER, municipioId: 'm1', veredaId: 'v1' },
};

const candidate = (id: string, total = 1) => ({
  negocio_id: id,
  negocio_numero: '20260001',
  customer_name: 'José',
  customer_id_number: null,
  customer_phone: null,
  customer_address: 'Calle',
  municipality_id: null,
  municipality_name: null,
  expected_balance: '1000',
  overdue_balance: '0',
  next_due_date: '2026-10-01',
  open_installments: '1',
  total_count: String(total),
});

const ROUTE: CollectionRoute = {
  id: 'r1',
  gestor_id: 'g1',
  route_date: '2026-09-25',
  status: 'borrador',
  started_at: null,
  completed_at: null,
  total_expected: 1000,
  total_collected: 0,
  stops: [
    {
      id: 's1', negocio_id: 'n1', negocio_numero: 20260001, position: 1, status: 'pendiente',
      customer_name: 'José', customer_phone: null, customer_address: 'Calle', municipality_name: null,
      expected_balance: 1000, payment_id: null, payment_amount: null, outcome_reason: null, notes: null,
      arrived_at: null, completed_at: null,
    },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  downloadedAt.mockResolvedValue(1_000);
});

describe('fetchRouteCandidates', () => {
  it('pide al servidor con estado, municipio, departamento y vereda', async () => {
    rpc.mockResolvedValue({ data: [candidate('n1')], error: null });
    const result = await fetchRouteCandidates({ query: QUERY, page: 1, pageSize: 30, userId: 'g1' });
    expect(rpc).toHaveBeenCalledWith('get_collection_route_candidates', {
      p_search: 'pena',
      p_filter: 'al_dia',
      p_municipio_id: 'm1',
      p_page: 1,
      p_page_size: 30,
      p_departamento_id: null,
      p_vereda_id: 'v1',
    });
    expect(result.source).toBe('servidor');
    expect(result.rows[0].expected_balance).toBe(1000);
    expect(result.totalCount).toBe(1);
  });

  it('con el servidor anterior repite la llamada vieja y avisa que no filtró la vereda', async () => {
    rpc
      .mockResolvedValueOnce({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } })
      .mockResolvedValueOnce({ data: [candidate('n1')], error: null });
    const result = await fetchRouteCandidates({ query: QUERY, page: 1, pageSize: 30, userId: 'g1' });
    expect(rpc).toHaveBeenLastCalledWith('get_collection_route_candidates', {
      p_search: 'pena', p_filter: 'todas', p_municipio_id: 'm1', p_page: 1, p_page_size: 30,
    });
    expect(result.locationFilterIgnored).toBe(true);
  });

  it('sin señal usa lo descargado en el teléfono', async () => {
    rpc.mockRejectedValue(new Error('Network request failed'));
    localCandidates.mockResolvedValue({ rows: [], totalCount: 0 });
    const result = await fetchRouteCandidates({ query: QUERY, page: 1, pageSize: 30, userId: 'g1' });
    expect(result.source).toBe('local');
    expect(localCandidates).toHaveBeenCalledWith(expect.objectContaining({ userId: 'g1', query: QUERY }));
  });

  it('si NetInfo ya dice que no hay red no espera al servidor', async () => {
    localCandidates.mockResolvedValue({ rows: [], totalCount: 0 });
    const result = await fetchRouteCandidates({ query: QUERY, page: 1, pageSize: 30, userId: 'g1', offline: true });
    expect(rpc).not.toHaveBeenCalled();
    expect(result.source).toBe('local');
  });

  it('un error del servidor que no es de red no cae a lo local', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'Solo los gestores de cobro pueden crear rutas' } });
    await expect(fetchRouteCandidates({ query: QUERY, page: 1, pageSize: 30, userId: 'g1' })).rejects.toThrow('Solo los gestores');
    expect(localCandidates).not.toHaveBeenCalled();
  });
});

describe('fetchAllRouteCandidates (seleccionar todos los filtrados)', () => {
  it('servidor nuevo: una sola página de hasta 200', async () => {
    rpc.mockResolvedValue({ data: [candidate('a', 2), candidate('b', 2)], error: null });
    const result = await fetchAllRouteCandidates({ query: QUERY, userId: 'g1' });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0][1].p_page_size).toBe(200);
    expect(result.rows).toHaveLength(2);
  });

  it('servidor viejo que topa en 50: sigue pidiendo páginas', async () => {
    const page = (from: number, count: number) =>
      Array.from({ length: count }, (_, index) => candidate(`n${from + index}`, 70));
    rpc
      .mockResolvedValueOnce({ data: page(0, 50), error: null })
      .mockResolvedValueOnce({ data: page(50, 20), error: null });
    const result = await fetchAllRouteCandidates({ query: QUERY, userId: 'g1' });
    expect(result.rows).toHaveLength(70);
    expect(rpc.mock.calls[1][1]).toMatchObject({ p_page: 2, p_page_size: 50 });
  });
});

describe('editar y descargar la ruta', () => {
  it('setCollectionRouteStops manda el orden completo', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await setCollectionRouteStops('r1', ['n2', 'n1']);
    expect(rpc).toHaveBeenCalledWith('set_collection_route_stops', { p_route_id: 'r1', p_negocio_ids: ['n2', 'n1'] });
  });

  it('setCollectionRouteStops explica si el servidor aún no lo soporta', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'x' } });
    await expect(setCollectionRouteStops('r1', ['n1'])).rejects.toThrow('todavía no permite editar rutas');
  });

  it('abrir una ruta con señal solo actualiza la copia si ya estaba descargada', async () => {
    rpc.mockResolvedValue({ data: ROUTE, error: null });
    await fetchCollectionRoute('r1');
    expect(saveCopy).toHaveBeenCalledWith(expect.objectContaining({ id: 'r1' }), { onlyIfSaved: true });
  });

  it('sin señal la ruta sale de la base local', async () => {
    rpc.mockRejectedValue(new Error('Network request failed'));
    localRoute.mockResolvedValue(ROUTE);
    await expect(fetchCollectionRoute('r1')).resolves.toBe(ROUTE);
  });

  it('descargar: descarga manual, guarda la ruta y comprueba sus negocios', async () => {
    download.mockResolvedValue({ ok: true });
    rpc.mockResolvedValue({ data: ROUTE, error: null });
    snapshot.mockResolvedValue({ routeExists: true, stopNegocioIds: ['n1'], readyNegocioIds: new Set(['n1']) });
    const result = await downloadRouteForOffline('r1');
    expect(download).toHaveBeenCalled();
    expect(saveCopy).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'r1' }), { onlyIfSaved: false });
    expect(result).toEqual({ ok: true, status: expect.objectContaining({ state: 'guardada', downloadedAt: 1_000 }) });
  });

  it('descargar avisa las paradas cuyo negocio no quedó en el teléfono', async () => {
    download.mockResolvedValue({ ok: true });
    rpc.mockResolvedValue({ data: ROUTE, error: null });
    snapshot.mockResolvedValue({ routeExists: true, stopNegocioIds: ['n1'], readyNegocioIds: new Set() });
    const result = await downloadRouteForOffline('r1');
    expect(result).toEqual({ ok: true, status: expect.objectContaining({ state: 'pendiente', missingNegocioNumeros: [20260001] }) });
  });

  it('descargar sin señal no toca nada', async () => {
    download.mockResolvedValue({ ok: false, reason: 'offline' });
    await expect(downloadRouteForOffline('r1')).resolves.toEqual({ ok: false, reason: 'offline' });
    expect(rpc).not.toHaveBeenCalled();
    expect(saveCopy).not.toHaveBeenCalled();
  });
});

describe('lista de rutas sin señal', () => {
  it('suma la última ruta abierta con señal aunque no se haya descargado', async () => {
    rpc.mockRejectedValue(new Error('Network request failed'));
    localRoutes.mockResolvedValue([]);
    cached.mockResolvedValue(ROUTE);
    const routes = await fetchMyCollectionRoutes();
    expect(routes).toEqual([expect.objectContaining({ id: 'r1', stop_count: 1, completed_count: 0 })]);
  });

  it('no la duplica si ya está en la base local', () => {
    const summary = { id: 'r1', route_date: '2026-09-25', status: 'borrador' as const, stop_count: 1, completed_count: 0, expected_total: 0, collected_total: 0 };
    expect(withCachedActiveRoute([summary], ROUTE)).toEqual([summary]);
  });
});

describe('cerrar la jornada', () => {
  const enqueue = enqueueRouteCommand as jest.Mock;
  beforeEach(() => {
    rpc.mockReset();
    enqueue.mockReset();
  });

  it('cierre normal y cancelación llaman como antes (sin parámetros nuevos)', () => {
    expect(finishRouteRpcArgs('r1', false)).toEqual({ p_route_id: 'r1', p_cancel: false });
    expect(finishRouteRpcArgs('r1', true, { closePending: true, reason: 'x' })).toEqual({ p_route_id: 'r1', p_cancel: true });
  });

  it('con pendientes manda p_close_pending y el motivo recortado (vacío no viaja)', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    const result = await finishCollectionRoute('r1', false, { closePending: true, reason: '  Se acabó el día ' });
    expect(result).toEqual({ queued: false });
    expect(rpc).toHaveBeenCalledWith('finish_collection_route', {
      p_route_id: 'r1', p_cancel: false, p_close_pending: true, p_reason: 'Se acabó el día',
    });
    expect(finishRouteRpcArgs('r1', false, { closePending: true, reason: '   ' })).toEqual({
      p_route_id: 'r1', p_cancel: false, p_close_pending: true,
    });
  });

  it('servidor sin la migración: explica que aún no se puede cerrar con pendientes', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } });
    await expect(finishCollectionRoute('r1', false, { closePending: true })).rejects.toThrow(/todavía no permite cerrar la jornada/);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('sin señal encola el cierre con pendientes y el motivo', async () => {
    rpc.mockRejectedValue(new Error('Network request failed'));
    enqueue.mockResolvedValue(true);
    const result = await finishCollectionRoute('r1', false, { closePending: true, reason: ' Lluvia ' });
    expect(result).toEqual({ queued: true });
    expect(enqueue).toHaveBeenCalledWith({ type: 'finish_route', routeId: 'r1', cancel: false, closePending: true, reason: 'Lluvia' });
  });

  it('sin señal el cierre normal se encola igual que antes', async () => {
    rpc.mockRejectedValue(new Error('Network request failed'));
    enqueue.mockResolvedValue(true);
    await finishCollectionRoute('r1');
    expect(enqueue).toHaveBeenCalledWith({ type: 'finish_route', routeId: 'r1', cancel: false });
  });
});

describe('señal débil: si NetInfo dice que no hay red no se espera al servidor', () => {
  const enqueue = enqueueRouteCommand as jest.Mock;
  beforeEach(() => {
    useSyncStore.setState({ online: false });
    enqueue.mockReset().mockResolvedValue(true);
  });
  afterEach(() => useSyncStore.setState({ online: true }));

  it('abrir la ruta va directo a la copia del teléfono', async () => {
    localRoute.mockResolvedValue(ROUTE);
    await expect(fetchCollectionRoute('r1')).resolves.toBe(ROUTE);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('sin copia en el teléfono dice que no hay conexión (error de red)', async () => {
    localRoute.mockResolvedValue(null);
    await expect(fetchCollectionRoute('r1')).rejects.toThrow('Sin conexión a internet.');
  });

  it('la lista de rutas sale del teléfono sin tocar el servidor', async () => {
    localRoutes.mockResolvedValue([]);
    cached.mockResolvedValue(null);
    await expect(fetchMyCollectionRoutes()).resolves.toEqual([]);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('iniciar, seleccionar y registrar novedad se encolan sin llamar al servidor', async () => {
    await expect(startCollectionRoute('r1')).resolves.toEqual({ queued: true });
    await expect(selectCollectionRouteStop('s1', 'r1')).resolves.toEqual({ queued: true });
    await expect(updateCollectionRouteStop('s1', 'sin_pago', 'No estaba', '', 'r1')).resolves.toEqual({ queued: true });
    expect(rpc).not.toHaveBeenCalled();
    expect(enqueue.mock.calls.map(([command]) => command.type)).toEqual(['start_route', 'select_route_stop', 'update_route_stop']);
  });

  it('sin cola local, el error de red sube a la pantalla', async () => {
    enqueue.mockResolvedValue(false);
    await expect(startCollectionRoute('r1')).rejects.toThrow('Sin conexión a internet.');
  });

  it('con red, un error de red también cae a la cola; un rechazo del servidor no', async () => {
    useSyncStore.setState({ online: true });
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'La red no respondió a tiempo.' } });
    await expect(startCollectionRoute('r1')).resolves.toEqual({ queued: true });
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'La ruta no está disponible para iniciar' } });
    await expect(startCollectionRoute('r1')).rejects.toThrow('La ruta no está disponible para iniciar');
  });
});
