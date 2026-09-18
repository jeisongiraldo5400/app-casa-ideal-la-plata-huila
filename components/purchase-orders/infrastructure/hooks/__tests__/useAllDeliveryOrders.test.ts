import { act, renderHook, waitFor } from '@testing-library/react-native';
import { EMPTY_DELIVERY_LOCATION_FILTER } from '../../../domain/deliveryLocation';
import { DeliveryOrder } from '../../../types';
import type { DeliveryOrdersPage } from '../../services/deliveryOrdersPageService';
import { fetchDeliveryOrdersPage } from '../../services/deliveryOrdersPageService';
import { useAllDeliveryOrders } from '../useAllDeliveryOrders';

jest.mock('../../services/deliveryOrdersPageService', () => ({
  DELIVERY_ORDERS_PAGE_SIZE: 10,
  fetchDeliveryOrdersPage: jest.fn(),
}));

// `useFocusEffect` fuera de un navegador: basta con correr el efecto como tal.
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (callback: () => void | (() => void)) => {
    const react = jest.requireActual<typeof import('react')>('react');
    react.useEffect(callback, [callback]);
  },
}));

const fetchPage = fetchDeliveryOrdersPage as jest.Mock;

function order(id: string): DeliveryOrder {
  return {
    id,
    order_number: `OE-${id}`,
    created_at: `2026-09-${id.padStart(2, '0')}T10:00:00Z`,
    created_by: 'u-1',
    created_by_name: 'Administrador',
    customer_id: null,
    customer_id_number: null,
    customer_name: null,
    customer_phone: null,
    customer_email: null,
    assigned_to_user_id: null,
    assigned_to_user_name: null,
    assigned_to_user_email: null,
    order_type: 'customer',
    delivery_address: null,
    municipio_id: null,
    vereda_id: null,
    departamento_id: null,
    departamento_name: null,
    municipio_name: null,
    vereda_name: null,
    notes: null,
    status: 'pending',
    total_items: 0,
    total_quantity: 0,
    delivered_items: 0,
    delivered_quantity: 0,
    items: [],
  };
}

function page(ids: string[], hasMore: boolean): DeliveryOrdersPage {
  const orders = ids.map(order);
  const last = orders[orders.length - 1];
  return {
    orders,
    hasMore,
    cursor: last ? { createdAt: last.created_at, id: last.id } : null,
    serverPaginated: true,
  };
}

/** Promesa que se resuelve a mano, para forzar el orden de las respuestas. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

const base = { searchQuery: '', locationFilter: EMPTY_DELIVERY_LOCATION_FILTER };

describe('useAllDeliveryOrders', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('carga la primera página sin cursor', async () => {
    fetchPage.mockResolvedValue(page(['1', '2'], true));

    const { result } = renderHook(() => useAllDeliveryOrders(base));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(fetchPage).toHaveBeenCalledTimes(1);
    expect(fetchPage).toHaveBeenCalledWith(expect.objectContaining({ cursor: null, pageSize: 10 }));
    expect(result.current.orders.map((o) => o.id)).toEqual(['1', '2']);
    expect(result.current.hasMore).toBe(true);
  });

  it('«cargar más» pide la siguiente página con el cursor y concatena', async () => {
    fetchPage.mockResolvedValueOnce(page(['1', '2'], true));
    const { result } = renderHook(() => useAllDeliveryOrders(base));
    await waitFor(() => expect(result.current.loading).toBe(false));

    fetchPage.mockResolvedValueOnce(page(['3', '4'], false));
    await act(async () => { result.current.loadMore(); });

    expect(fetchPage).toHaveBeenLastCalledWith(
      expect.objectContaining({ cursor: { createdAt: '2026-09-02T10:00:00Z', id: '2' } }),
    );
    expect(result.current.orders.map((o) => o.id)).toEqual(['1', '2', '3', '4']);
    expect(result.current.hasMore).toBe(false);
  });

  it('no repite una orden que ya estaba en la lista', async () => {
    fetchPage.mockResolvedValueOnce(page(['1', '2'], true));
    const { result } = renderHook(() => useAllDeliveryOrders(base));
    await waitFor(() => expect(result.current.loading).toBe(false));

    fetchPage.mockResolvedValueOnce(page(['2', '3'], false));
    await act(async () => { result.current.loadMore(); });

    expect(result.current.orders.map((o) => o.id)).toEqual(['1', '2', '3']);
  });

  it('al final de la lista «cargar más» no pide nada', async () => {
    fetchPage.mockResolvedValue(page(['1'], false));
    const { result } = renderHook(() => useAllDeliveryOrders(base));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => { result.current.loadMore(); });

    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it('dos «cargar más» seguidos solo piden una página', async () => {
    fetchPage.mockResolvedValueOnce(page(['1'], true));
    const { result } = renderHook(() => useAllDeliveryOrders(base));
    await waitFor(() => expect(result.current.loading).toBe(false));

    const siguiente = deferred<DeliveryOrdersPage>();
    fetchPage.mockReturnValueOnce(siguiente.promise);
    act(() => {
      result.current.loadMore();
      result.current.loadMore();
    });
    await act(async () => { siguiente.resolve(page(['2'], false)); });

    expect(fetchPage).toHaveBeenCalledTimes(2);
    expect(result.current.orders.map((o) => o.id)).toEqual(['1', '2']);
  });

  it('cambiar el filtro de ubicación reinicia la paginación', async () => {
    fetchPage.mockResolvedValue(page(['1', '2'], true));
    const { result, rerender } = renderHook(
      (props: Parameters<typeof useAllDeliveryOrders>[0]) => useAllDeliveryOrders(props),
      { initialProps: base },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    fetchPage.mockResolvedValue(page(['9'], false));
    rerender({ ...base, locationFilter: { departamentoId: 'dep-1', municipioId: '', veredaId: '' } });
    await waitFor(() => expect(result.current.orders.map((o) => o.id)).toEqual(['9']));

    expect(fetchPage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        cursor: null,
        location: { departamentoId: 'dep-1', municipioId: '', veredaId: '' },
      }),
    );
  });

  it('una respuesta vieja no pisa a una nueva', async () => {
    const vieja = deferred<DeliveryOrdersPage>();
    const nueva = deferred<DeliveryOrdersPage>();
    fetchPage.mockReturnValueOnce(vieja.promise).mockReturnValueOnce(nueva.promise);

    const { result, rerender } = renderHook(
      (props: Parameters<typeof useAllDeliveryOrders>[0]) => useAllDeliveryOrders(props),
      { initialProps: base },
    );
    rerender({ ...base, locationFilter: { departamentoId: 'dep-1', municipioId: '', veredaId: '' } });

    // La segunda petición contesta primero y la primera llega tarde.
    await act(async () => { nueva.resolve(page(['nueva'], false)); });
    await act(async () => { vieja.resolve(page(['vieja'], true)); });

    expect(result.current.orders.map((o) => o.id)).toEqual(['nueva']);
    expect(result.current.hasMore).toBe(false);
  });

  it('un fallo al cargar deja el mensaje y vacía la lista', async () => {
    fetchPage.mockRejectedValue(new Error('sin red'));

    const { result } = renderHook(() => useAllDeliveryOrders(base));

    await waitFor(() => expect(result.current.error).toBe('sin red'));
    expect(result.current.orders).toEqual([]);
    expect(result.current.hasMore).toBe(false);
  });

  it('el disparador externo vuelve a pedir la primera página', async () => {
    fetchPage.mockResolvedValue(page(['1'], false));
    const { result, rerender } = renderHook(
      (props: Parameters<typeof useAllDeliveryOrders>[0]) => useAllDeliveryOrders(props),
      { initialProps: { ...base, refreshTrigger: 0 } },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    rerender({ ...base, refreshTrigger: 1 });
    await waitFor(() => expect(fetchPage).toHaveBeenCalledTimes(2));
    expect(fetchPage).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: null }));
  });

  it('el texto buscado viaja al servidor tras el debounce', async () => {
    jest.useFakeTimers();
    try {
      fetchPage.mockResolvedValue(page([], false));
      const { rerender } = renderHook(
        (props: Parameters<typeof useAllDeliveryOrders>[0]) => useAllDeliveryOrders(props),
        { initialProps: base },
      );

      rerender({ ...base, searchQuery: 'OE-2026' });
      expect(fetchPage).toHaveBeenCalledTimes(1);

      await act(async () => { jest.advanceTimersByTime(400); });
      expect(fetchPage).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'OE-2026', cursor: null }));
    } finally {
      jest.useRealTimers();
    }
  });
});
