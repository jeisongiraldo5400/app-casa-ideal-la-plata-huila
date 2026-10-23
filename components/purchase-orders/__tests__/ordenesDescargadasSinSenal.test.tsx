import { render, renderHook, waitFor } from '@testing-library/react-native';
import React from 'react';
import { EMPTY_DELIVERY_LOCATION_FILTER } from '../domain/deliveryLocation';
import { DeliveryOrderProductsModal } from '../components/DeliveryOrderProductsModal';
import { DeliveryOrderRecipientModal } from '../components/DeliveryOrderRecipientModal';
import { useAllDeliveryOrders } from '../infrastructure/hooks/useAllDeliveryOrders';
import { fetchDeliveryOrdersPage } from '../infrastructure/services/deliveryOrdersPageService';
import {
  ORDER_NOT_ON_PHONE_MESSAGE,
  localOrderToDeliveryOrder,
} from '../infrastructure/services/localDeliveryOrdersService';
import { useSyncStore } from '@/lib/offline/store/syncStore';
import type {
  LocalOfflineOrder,
  LocalOfflineOrderLine,
} from '@/lib/offline/repositories/deliveryOrdersRepository';

/**
 * Caso reportado (2026-10-22): el vendedor lleva en el teléfono una remisión
 * (Llevar en el teléfono + Descargar) y sale sin señal. Al abrir «Todas las
 * órdenes», los productos o el destinatario, la app volvía a consultar al
 * servidor, fallaba por red y no mostraba nada de lo guardado.
 *
 * Sin red se simula como en las demás pruebas sin señal: el servidor rechaza
 * con «Network request failed» (señal débil: NetInfo dice que hay red) o el
 * almacén de sincronización dice `online: false`.
 */

const NETWORK_ERROR = new Error('TypeError: Network request failed');

jest.mock('../infrastructure/services/deliveryOrdersPageService', () => ({
  DELIVERY_ORDERS_PAGE_SIZE: 10,
  fetchDeliveryOrdersPage: jest.fn(),
}));

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useFocusEffect: (callback: () => void | (() => void)) => {
    const react = jest.requireActual<typeof import('react')>('react');
    react.useEffect(callback, [callback]);
  },
}));

jest.mock('@/components/theme', () => ({
  useTheme: () => ({ isDark: false }),
}));

jest.mock('@expo/vector-icons', () => {
  const ReactModule = jest.requireActual<typeof import('react')>('react');
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    MaterialIcons: ({ name }: { name: string }) => ReactModule.createElement(Text, null, name),
  };
});

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

const mockSupabaseFrom = jest.fn();
jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: (...args: unknown[]) => mockSupabaseFrom(...args),
    rpc: jest.fn(async () => {
      throw new Error('TypeError: Network request failed');
    }),
  },
}));

const REMISSION: LocalOfflineOrder = {
  id: 'rem-1',
  orderNumber: 'REM-0042',
  orderType: 'remission',
  status: 'approved',
  customerId: null,
  customerName: null,
  municipioId: null,
  veredaId: null,
  deliveryAddress: null,
  createdAt: '2026-10-20T10:00:00Z',
  customerIdNumber: null,
  assignedUserName: 'Jhojan Vendedor',
  zoneName: 'Zona Norte',
  notes: 'Camión 2',
  usable: true,
  unusableReason: null,
  snapshotAt: Date.parse('2026-10-22T07:15:00'),
};

const CUSTOMER_ORDER: LocalOfflineOrder = {
  ...REMISSION,
  id: 'oe-7',
  orderNumber: 'OE-2026-0007',
  orderType: 'customer',
  customerId: 'cust-1',
  customerName: 'MARÍA PÉREZ',
  customerIdNumber: '1.040.555',
  municipioId: 'm1',
  veredaId: 'v1',
  deliveryAddress: 'Finca El Roble',
  createdAt: '2026-10-21T10:00:00Z',
  assignedUserName: null,
  notes: null,
};

// Ya vinculada a un negocio y sin líneas en el teléfono (servidor anterior a
// 20261231770000, o cancelada): sólo la cabecera.
const LINKED_ORDER: LocalOfflineOrder = {
  ...CUSTOMER_ORDER,
  id: 'oe-8',
  orderNumber: 'OE-2026-0008',
  customerName: 'CARLOS',
  customerIdNumber: '777',
  createdAt: '2026-10-19T10:00:00Z',
  usable: false,
  unusableReason: 'La orden ya está vinculada a un negocio',
};

// Ya vinculada a un negocio, con sus productos (20261231770000: display_lines).
const LINKED_WITH_LINES: LocalOfflineOrder = {
  ...LINKED_ORDER,
  id: 'oe-10',
  orderNumber: 'OE-2026-0010',
  customerName: 'LUZ',
  createdAt: '2026-10-18T10:00:00Z',
};

const LINES: Record<string, LocalOfflineOrderLine[]> = {
  'oe-10': [
    {
      orderId: 'oe-10', groupKind: 'self', sourceOrderId: 'oe-10', sourceOrderNumber: 'OE-2026-0010',
      sourceCustomerId: 'cust-1', sourceCustomerName: 'LUZ', sourceHasNegocio: true,
      productId: 'p-colchon', productName: 'COLCHÓN DOBLE', productSku: 'COL-2',
      warehouseId: 'w1', warehouseName: 'La Argentina', quantity: 2, availableQuantity: 0,
    },
  ],
  'rem-1': [
    {
      orderId: 'rem-1', groupKind: 'own', sourceOrderId: 'rem-1', sourceOrderNumber: 'REM-0042',
      sourceCustomerId: null, sourceCustomerName: null, sourceHasNegocio: false,
      productId: 'p-cama', productName: 'CAMA SENCILLA', productSku: 'CAM-1',
      warehouseId: 'w1', warehouseName: 'La Argentina', quantity: 3, availableQuantity: 2,
    },
    {
      orderId: 'rem-1', groupKind: 'child', sourceOrderId: 'oe-9', sourceOrderNumber: 'OE-2026-0009',
      sourceCustomerId: 'cust-9', sourceCustomerName: 'PEDRO', sourceHasNegocio: false,
      productId: 'p-nevera', productName: 'NEVERA 250L', productSku: 'NEV-250',
      warehouseId: 'w1', warehouseName: 'La Argentina', quantity: 1, availableQuantity: 1,
    },
  ],
  'oe-7': [
    {
      orderId: 'oe-7', groupKind: 'self', sourceOrderId: 'oe-7', sourceOrderNumber: 'OE-2026-0007',
      sourceCustomerId: 'cust-1', sourceCustomerName: 'MARÍA PÉREZ', sourceHasNegocio: false,
      productId: 'p-lav', productName: 'LAVADORA', productSku: 'LAV-1',
      warehouseId: 'w1', warehouseName: 'La Argentina', quantity: 1, availableQuantity: 1,
    },
  ],
};

jest.mock('@/lib/offline/repositories/deliveryOrdersRepository', () => ({
  listLocalOfflineOrders: jest.fn(async () => [mockRemission(), mockCustomerOrder(), mockLinkedOrder(), mockLinkedWithLines()]),
  getLocalOfflineOrderLines: jest.fn(async (id: string) => mockLines()[id] ?? []),
}));
// Los fixtures se declaran arriba; jest.mock se eleva, así que se leen tarde.
function mockRemission() { return REMISSION; }
function mockCustomerOrder() { return CUSTOMER_ORDER; }
function mockLinkedOrder() { return LINKED_ORDER; }
function mockLinkedWithLines() { return LINKED_WITH_LINES; }
function mockLines() { return LINES; }

jest.mock('@/lib/offline/repositories/catalogRepository', () => ({
  fetchLocationCatalogsFromLocal: jest.fn(async () => ({
    departamentos: [{ id: 'd1', nombre: 'Antioquia' }],
    municipios: [{ id: 'm1', nombre: 'Andes', departamento_id: 'd1' }],
    veredas: [{ id: 'v1', nombre: 'La Esperanza', municipio_id: 'm1' }],
  })),
}));

jest.mock('@/lib/offline/repositories/offlineRepository', () => ({
  fetchCustomerFromLocal: jest.fn(async (id: string) =>
    id === 'cust-1'
      ? { id, name: 'MARÍA PÉREZ', idNumber: '1040555', phone: '3001234567', sellerId: null, email: null, address: 'Finca El Roble' }
      : null
  ),
}));

const fetchPage = fetchDeliveryOrdersPage as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  useSyncStore.setState({ online: true });
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  (console.error as jest.Mock).mockRestore?.();
});

describe('Todas las órdenes · sin señal', () => {
  const base = { searchQuery: '', locationFilter: EMPTY_DELIVERY_LOCATION_FILTER };

  it('si el servidor no responde por red, muestra las órdenes guardadas en el teléfono sin error', async () => {
    fetchPage.mockRejectedValue(NETWORK_ERROR);
    const { result } = renderHook(() => useAllDeliveryOrders(base));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeNull();
    expect(result.current.fromLocal).toBe(true);
    expect(result.current.orders.map((order) => order.order_number)).toEqual(['OE-2026-0007', 'REM-0042', 'OE-2026-0008', 'OE-2026-0010']);
    expect(result.current.hasMore).toBe(false);
    const oe = result.current.orders[0];
    expect(oe.from_local).toBe(true);
    expect(oe.municipio_name).toBe('Andes');
    expect(oe.departamento_name).toBe('Antioquia');
    expect(oe.total_quantity).toBe(1);
  });

  it('con el teléfono sin señal no espera al servidor: lee de una vez lo guardado', async () => {
    useSyncStore.setState({ online: false });
    const { result } = renderHook(() => useAllDeliveryOrders({ ...base, searchQuery: 'maria' }));

    await waitFor(() => expect(result.current.fromLocal).toBe(true));
    await waitFor(() => expect(result.current.orders.map((order) => order.id)).toEqual(['oe-7']));
    expect(fetchPage).not.toHaveBeenCalled();
    expect(result.current.error).toBeNull();
  });

  it('un error que no es de red se sigue mostrando como error', async () => {
    fetchPage.mockRejectedValue(new Error('permission denied for table delivery_orders'));
    const { result } = renderHook(() => useAllDeliveryOrders(base));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.fromLocal).toBe(false);
    expect(result.current.error).toBeTruthy();
    expect(result.current.orders).toEqual([]);
  });
});

describe('Productos de la orden · sin señal', () => {
  function renderModal(orderId: string, loadItems: jest.Mock) {
    return render(
      <DeliveryOrderProductsModal
        visible
        onClose={jest.fn()}
        orderId={orderId}
        orderNumber={orderId}
        loadItems={loadItems}
        loadSerials={jest.fn().mockResolvedValue({})}
      />,
    );
  }

  it('si la consulta falla por red, muestra los productos guardados con el aviso discreto', async () => {
    const screen = renderModal('rem-1', jest.fn().mockRejectedValue(NETWORK_ERROR));

    await waitFor(() => expect(screen.getByText('CAMA SENCILLA')).toBeTruthy());
    expect(screen.getByText('NEVERA 250L')).toBeTruthy();
    expect(screen.getByText('Orden de cliente: OE-2026-0009 · PEDRO')).toBeTruthy();
    expect(screen.getByTestId('delivery-order-products-local-notice')).toBeTruthy();
    expect(screen.getByText(/Sin señal: mostrando lo guardado en el teléfono/)).toBeTruthy();
    // Sin inventar avances: la descarga no trae lo entregado.
    expect(screen.queryByText('Entregado')).toBeNull();
    expect(screen.getAllByText('Disponible').length).toBe(2);
    expect(screen.queryByText(/Network request failed/)).toBeNull();
    expect(screen.queryByText('Reintentar')).toBeNull();
  });

  it('sin señal no consulta al servidor', async () => {
    useSyncStore.setState({ online: false });
    const loadItems = jest.fn();
    const screen = renderModal('oe-7', loadItems);

    await waitFor(() => expect(screen.getByText('LAVADORA')).toBeTruthy());
    expect(loadItems).not.toHaveBeenCalled();
  });

  it('una orden guardada sin productos (ya vinculada) dice por qué, sin error', async () => {
    useSyncStore.setState({ online: false });
    const screen = renderModal('oe-8', jest.fn());

    await waitFor(() =>
      expect(screen.getByText(/ya está vinculada a un negocio: no hay productos de esta orden guardados/)).toBeTruthy()
    );
    expect(screen.queryByText('Reintentar')).toBeNull();
  });

  it('una orden ya vinculada con sus productos guardados los muestra completos, sin «Disponible»', async () => {
    useSyncStore.setState({ online: false });
    const loadItems = jest.fn();
    const screen = renderModal('oe-10', loadItems);

    await waitFor(() => expect(screen.getByText('COLCHÓN DOBLE')).toBeTruthy());
    expect(loadItems).not.toHaveBeenCalled();
    expect(screen.getByText(/ya está vinculada a un negocio: sus productos se muestran solo para consulta/)).toBeTruthy();
    expect(screen.queryByText(/no hay productos de esta orden guardados/)).toBeNull();
    expect(screen.getByText('En orden')).toBeTruthy();
    expect(screen.queryByText('Disponible')).toBeNull();
    expect(screen.queryByText('Reintentar')).toBeNull();
  });

  it('una orden que no se llevó al teléfono dice cómo llevarla, no el error de red', async () => {
    const screen = renderModal('oe-otra', jest.fn().mockRejectedValue(NETWORK_ERROR));

    await waitFor(() => expect(screen.getByText(ORDER_NOT_ON_PHONE_MESSAGE)).toBeTruthy());
    expect(screen.queryByText(/Network request failed/)).toBeNull();
  });
});

describe('Destinatario · sin señal', () => {
  it('la orden guardada muestra el cliente descargado sin consultar al servidor', async () => {
    const order = localOrderToDeliveryOrder(CUSTOMER_ORDER, LINES['oe-7']);
    const screen = render(<DeliveryOrderRecipientModal visible onClose={jest.fn()} order={order} />);

    await waitFor(() => expect(screen.getByText('MARÍA PÉREZ')).toBeTruthy());
    expect(screen.getByText('3001234567')).toBeTruthy();
    expect(mockSupabaseFrom).not.toHaveBeenCalled();
  });

  it('con una orden del servidor y la señal caída, cae a lo guardado en vez del error', async () => {
    mockSupabaseFrom.mockImplementation(() => {
      const builder: Record<string, unknown> = {};
      ['select', 'eq'].forEach((method) => {
        builder[method] = () => builder;
      });
      builder.single = () => Promise.reject(NETWORK_ERROR);
      return builder;
    });
    const order = { ...localOrderToDeliveryOrder(CUSTOMER_ORDER, LINES['oe-7']), from_local: false };
    const screen = render(<DeliveryOrderRecipientModal visible onClose={jest.fn()} order={order} />);

    await waitFor(() => expect(screen.getByText('MARÍA PÉREZ')).toBeTruthy());
    expect(screen.queryByText(/Error al cargar/)).toBeNull();
  });
});
