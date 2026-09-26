import { act, renderHook, waitFor } from '@testing-library/react-native';
import { findSuggestedStopForNegocio, readRouteStopState } from '@/lib/collection-routes/routeStopContextService';
import { useRouteStopPago } from '../useRouteStopPago';

jest.mock('@/lib/collection-routes/routeStopContextService', () => ({
  findSuggestedStopForNegocio: jest.fn(),
  readRouteStopState: jest.fn(),
}));

const readState = readRouteStopState as jest.Mock;
const suggest = findSuggestedStopForNegocio as jest.Mock;

const state = (stopStatus: string, routeStatus = 'activa') => ({
  stopId: 's1',
  routeId: 'r1',
  negocioId: 'n1',
  position: 4,
  stopStatus,
  routeStatus,
  routeDate: '2026-09-25',
});

beforeEach(() => {
  readState.mockReset().mockResolvedValue(state('actual'));
  suggest.mockReset().mockResolvedValue(null);
});

describe('useRouteStopPago', () => {
  it('la parada solo viaja en el primer cobro', async () => {
    const { result } = renderHook(() =>
      useRouteStopPago({ negocioId: 'n1', routeStopIdParam: 's1', online: true })
    );
    await waitFor(() => expect(result.current.position).toBe(4));
    await expect(result.current.resolveForPago()).resolves.toBe('s1');
    act(() => result.current.consume());
    expect(result.current.stopId).toBeNull();
    await expect(result.current.resolveForPago()).resolves.toBeNull();
  });

  it('si el teléfono sabe que la parada ya no es la actual, el cobro es un abono normal', async () => {
    readState.mockResolvedValue(state('cobrado'));
    const { result } = renderHook(() =>
      useRouteStopPago({ negocioId: 'n1', routeStopIdParam: 's1', online: false })
    );
    await waitFor(() => expect(result.current.stopId).toBeNull());
    await expect(result.current.resolveForPago()).resolves.toBeNull();
  });

  it('al pagar comprueba solo con el teléfono (sin esperar a la red)', async () => {
    const { result } = renderHook(() =>
      useRouteStopPago({ negocioId: 'n1', routeStopIdParam: 's1', online: true })
    );
    await waitFor(() => expect(result.current.position).toBe(4));
    readState.mockClear();
    await result.current.resolveForPago();
    expect(readState).toHaveBeenCalledWith('s1', false);
  });

  it('sin parada, ofrece vincular la parada actual y no la vuelve a ofrecer tras cobrar', async () => {
    suggest.mockResolvedValue(state('actual'));
    const { result } = renderHook(() =>
      useRouteStopPago({ negocioId: 'n1', routeStopIdParam: undefined, online: true })
    );
    await waitFor(() => expect(result.current.suggestion?.stopId).toBe('s1'));
    act(() => result.current.link());
    expect(result.current.stopId).toBe('s1');
    act(() => result.current.consume());
    await waitFor(() => expect(suggest).toHaveBeenCalledTimes(2));
    expect(result.current.suggestion).toBeNull();
  });
});
