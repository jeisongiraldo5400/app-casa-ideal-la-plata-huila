import { supabase } from '@/lib/supabase';
import { findLocalRouteOutcomes } from '@/lib/offline/repositories/routesRepository';
import { fetchUltimaGestion } from '../ultimaGestionService';

jest.mock('@/lib/supabase', () => ({ supabase: { rpc: jest.fn() } }));
jest.mock('@/lib/offline/repositories/routesRepository', () => ({ findLocalRouteOutcomes: jest.fn() }));

const rpc = supabase.rpc as unknown as jest.Mock;
const local = findLocalRouteOutcomes as jest.Mock;

const LOCAL_ROW = {
  negocio_id: 'n1',
  stop_status: 'sin_pago',
  outcome_reason: 'No estaba',
  notes: null,
  occurred_at: '2026-09-20T15:00:00Z',
  route_date: '2026-09-20',
  gestor_name: null,
};

beforeEach(() => {
  rpc.mockReset();
  local.mockReset().mockResolvedValue([LOCAL_ROW]);
});

it('con señal pide una vez por lista (sin repetidos) y gana lo más reciente', async () => {
  rpc.mockResolvedValue({
    data: [{ ...LOCAL_ROW, stop_status: 'reprogramado', occurred_at: '2026-09-22T15:00:00Z', gestor_name: 'Gestor' }],
    error: null,
  });
  const result = await fetchUltimaGestion(['n1', 'n1', 'n2'], true);
  expect(rpc).toHaveBeenCalledWith('get_negocios_ultima_gestion', { p_negocio_ids: ['n1', 'n2'] });
  expect(result.get('n1')).toMatchObject({ stop_status: 'reprogramado', gestor_name: 'Gestor' });
});

it('una novedad del teléfono más nueva que la del servidor se muestra', async () => {
  rpc.mockResolvedValue({ data: [{ ...LOCAL_ROW, occurred_at: '2026-09-10T15:00:00Z' }], error: null });
  expect((await fetchUltimaGestion(['n1'], true)).get('n1')?.occurred_at).toBe('2026-09-20T15:00:00Z');
});

it('sin señal o con el servidor sin la migración, lo del teléfono', async () => {
  expect((await fetchUltimaGestion(['n1'], false)).get('n1')?.outcome_reason).toBe('No estaba');
  expect(rpc).not.toHaveBeenCalled();
  rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } });
  expect((await fetchUltimaGestion(['n1'], true)).get('n1')?.outcome_reason).toBe('No estaba');
});

it('lista vacía: no pregunta nada', async () => {
  expect((await fetchUltimaGestion([], true)).size).toBe(0);
  expect(rpc).not.toHaveBeenCalled();
});
