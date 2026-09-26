import { supabase } from '@/lib/supabase';
import { findLocalCurrentStopsForNegocio, readLocalRouteStop } from '@/lib/offline/repositories/routesRepository';
import { getCachedActiveRoute } from '../routeCache';
import { findSuggestedStopForNegocio, isRouteStopStillCurrent, readRouteStopState } from '../routeStopContextService';

jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn() } }));
jest.mock('@/lib/offline/repositories/routesRepository', () => ({
  findLocalCurrentStopsForNegocio: jest.fn(),
  readLocalRouteStop: jest.fn(),
}));
jest.mock('../routeCache', () => ({ getCachedActiveRoute: jest.fn() }));
jest.mock('@/lib/localDate', () => ({ bogotaDateValue: () => '2026-09-25' }));

const from = supabase.from as unknown as jest.Mock;
const localStop = readLocalRouteStop as jest.Mock;
const localCurrent = findLocalCurrentStopsForNegocio as jest.Mock;
const cached = getCachedActiveRoute as jest.Mock;

type Chain = { select: jest.Mock; eq: jest.Mock; maybeSingle: jest.Mock };

function serverReturns(data: unknown, error: unknown = null) {
  const chain: Chain = {
    select: jest.fn((): Chain => chain),
    eq: jest.fn((): Chain => chain),
    maybeSingle: jest.fn(async () => ({ data, error })),
  };
  from.mockReturnValue(chain);
  return chain;
}

const SERVER_ROW = { id: 's1', route_id: 'r1', negocio_id: 'n1', position: 2, status: 'actual', route: { status: 'activa', route_date: '2026-09-25' } };
const CACHED_ROUTE = {
  id: 'r1',
  status: 'activa',
  route_date: '2026-09-25',
  stops: [{ id: 's1', negocio_id: 'n1', position: 2, status: 'actual' }],
};

beforeEach(() => {
  from.mockReset();
  localStop.mockReset().mockResolvedValue(null);
  localCurrent.mockReset().mockResolvedValue([]);
  cached.mockReset().mockResolvedValue(null);
});

describe('readRouteStopState', () => {
  it('con señal pregunta al servidor', async () => {
    serverReturns(SERVER_ROW);
    await expect(readRouteStopState('s1', true)).resolves.toMatchObject({ stopStatus: 'actual', routeStatus: 'activa', position: 2 });
  });

  it('sin señal no toca el servidor: teléfono y luego caché', async () => {
    localStop.mockResolvedValue({ stopId: 's1', stopStatus: 'cobrado', routeStatus: 'activa' });
    await expect(isRouteStopStillCurrent('s1', false)).resolves.toBe(false);
    expect(from).not.toHaveBeenCalled();

    localStop.mockResolvedValue(null);
    cached.mockResolvedValue(CACHED_ROUTE);
    await expect(isRouteStopStillCurrent('s1', false)).resolves.toBe(true);
  });

  it('si el servidor falla, cae a lo local; sin nada, no se sabe', async () => {
    serverReturns(null, { message: 'La red no respondió a tiempo.' });
    await expect(isRouteStopStillCurrent('s1', true)).resolves.toBeNull();
  });
});

describe('findSuggestedStopForNegocio', () => {
  it('sin señal ofrece la parada actual de la ruta en caché', async () => {
    cached.mockResolvedValue(CACHED_ROUTE);
    await expect(findSuggestedStopForNegocio('n1', false)).resolves.toMatchObject({ stopId: 's1', position: 2 });
  });

  it('con señal la confirma: si ya no es la actual, no la ofrece', async () => {
    cached.mockResolvedValue(CACHED_ROUTE);
    serverReturns({ ...SERVER_ROW, status: 'cobrado' });
    await expect(findSuggestedStopForNegocio('n1', true)).resolves.toBeNull();
  });

  it('otro negocio: nada que ofrecer', async () => {
    cached.mockResolvedValue(CACHED_ROUTE);
    await expect(findSuggestedStopForNegocio('n9', false)).resolves.toBeNull();
  });
});
