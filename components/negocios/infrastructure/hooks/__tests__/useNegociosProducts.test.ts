import { act, renderHook, waitFor } from '@testing-library/react-native';
import { fetchNegociosProducts } from '../../services/negocioProductLinesService';
import { useNegociosProducts } from '../useNegociosProducts';

jest.mock('../../services/negocioProductLinesService', () => ({
  fetchNegociosProducts: jest.fn(),
}));

const mockedFetch = fetchNegociosProducts as jest.MockedFunction<typeof fetchNegociosProducts>;

/** Responde con un producto por negocio pedido, salvo los que se indiquen vacíos. */
function respondWithOnePerId(empty: string[] = []) {
  mockedFetch.mockImplementation(async (ids) => {
    const result = new Map();
    for (const id of ids) {
      if (!empty.includes(id)) result.set(id, [{ name: `Producto ${id}`, sku: null, quantity: 1 }]);
    }
    return result;
  });
}

beforeEach(() => jest.clearAllMocks());

describe('useNegociosProducts', () => {
  it('una sola consulta para toda la página visible', async () => {
    respondWithOnePerId();
    const { result } = renderHook(() => useNegociosProducts(['n1', 'n2', 'n3']));
    await waitFor(() => expect(result.current.byNegocio.size).toBe(3));
    expect(mockedFetch).toHaveBeenCalledTimes(1);
    expect([...mockedFetch.mock.calls[0][0]].sort()).toEqual(['n1', 'n2', 'n3']);
    expect(result.current.byNegocio.get('n2')).toEqual([{ name: 'Producto n2', sku: null, quantity: 1 }]);
    expect(result.current.loading).toBe(false);
  });

  it('al crecer la lista (más filas o nueva búsqueda) solo pide los negocios nuevos', async () => {
    respondWithOnePerId(['n2']);
    const { result, rerender } = renderHook(({ ids }: { ids: string[] }) => useNegociosProducts(ids), {
      initialProps: { ids: ['n1', 'n2'] },
    });
    await waitFor(() => expect(result.current.byNegocio.size).toBe(2));

    rerender({ ids: ['n1', 'n2', 'n3', 'n4'] });
    await waitFor(() => expect(result.current.byNegocio.size).toBe(4));
    expect(mockedFetch).toHaveBeenCalledTimes(2);
    expect([...mockedFetch.mock.calls[1][0]].sort()).toEqual(['n3', 'n4']);
    // Un negocio sin productos no se vuelve a pedir.
    expect(result.current.byNegocio.get('n2')).toEqual([]);

    // Filtrar o reordenar lo ya cargado no consulta.
    rerender({ ids: ['n4', 'n1'] });
    expect(mockedFetch).toHaveBeenCalledTimes(2);
  });

  it('tirar para actualizar vuelve a pedir la página en una consulta', async () => {
    respondWithOnePerId();
    const { result } = renderHook(() => useNegociosProducts(['n1', 'n2']));
    await waitFor(() => expect(result.current.byNegocio.size).toBe(2));
    act(() => result.current.refresh());
    await waitFor(() => expect(mockedFetch).toHaveBeenCalledTimes(2));
    expect([...mockedFetch.mock.calls[1][0]].sort()).toEqual(['n1', 'n2']);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.byNegocio.size).toBe(2);
  });

  it('si falla, avisa sin romper la lista', async () => {
    mockedFetch.mockRejectedValue(new Error('permiso'));
    const { result } = renderHook(() => useNegociosProducts(['n1']));
    await waitFor(() => expect(result.current.error).toBe('No se pudieron cargar los productos.'));
    expect(result.current.byNegocio.size).toBe(0);
    expect(result.current.loading).toBe(false);
  });

  it('sin negocios no consulta', () => {
    renderHook(() => useNegociosProducts([]));
    expect(mockedFetch).not.toHaveBeenCalled();
  });
});
