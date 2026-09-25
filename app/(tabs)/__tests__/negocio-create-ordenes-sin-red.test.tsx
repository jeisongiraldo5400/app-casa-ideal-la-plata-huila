import { fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';

import NegocioCreateScreen from '../negocio-create';
import {
  getLocalOfflineOrderLines,
  listLocalOfflineOrders,
  listLocalPendingRemissions,
  pendingLocalQuantitiesByOrigin,
} from '@/lib/offline/repositories/deliveryOrdersRepository';
import { useSyncStore } from '@/lib/offline/store/syncStore';

/**
 * Caso real (2026-09-25): sale un camión con una remisión aprobada; en el campo
 * sin señal el vendedor elige «Orden de entrega existente» → esa remisión →
 * los productos propios o una OE de cliente anidada, y hace el negocio. Las
 * órdenes salen de la foto de las que marcó «Llevar en el teléfono» con señal.
 * También «Enviar en remisión» funciona sin señal con la lista ligera.
 */

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: jest.fn(() => {
      const builder: any = {};
      ['select', 'is', 'eq', 'order', 'limit'].forEach((method) => {
        builder[method] = jest.fn(() => builder);
      });
      builder.maybeSingle = jest.fn(() => Promise.reject(new Error('Network request failed')));
      builder.single = jest.fn(() => Promise.reject(new Error('Network request failed')));
      builder.then = (_resolve: unknown, reject: (error: unknown) => void) =>
        reject(new Error('Network request failed'));
      return builder;
    }),
    rpc: jest.fn(async () => {
      throw new Error('Network request failed');
    }),
  },
}));

jest.mock('@/lib/offline/repositories/offlineRepository', () => ({
  canUseLocalDb: () => true,
  fetchNegociosListFromLocal: jest.fn(async () => []),
}));

jest.mock('@/lib/offline/repositories/catalogRepository', () => ({
  fetchLocationCatalogsFromLocal: jest.fn(async () => ({
    departamentos: [{ id: 'd1', nombre: 'Antioquia' }],
    municipios: [{ id: 'm1', nombre: 'Andes', departamento_id: 'd1' }],
    veredas: [{ id: 'v1', nombre: 'La Esperanza', municipio_id: 'm1' }],
  })),
  localCatalogPulledAt: jest.fn(async () => Date.now()),
  fetchCreditSettingsFromLocal: jest.fn(async () => null),
  canUseLocalCatalog: () => true,
  hasLocalCatalog: jest.fn(async () => true),
  stockForProductsFromLocal: jest.fn(async () => ({})),
  stockForProductFromLocal: jest.fn(async () => []),
}));

jest.mock('@/lib/offline/sync/downloadData', () => ({
  formatLastDownloadTime: (value: number | null) => (value ? '7:15 a. m.' : null),
}));

const mockCreateAndActivate = jest.fn();
// Las funciones tienen que ser las MISMAS entre renders: el asistente las usa
// como dependencias de su efecto de carga.
const mockNegociosStore = {
  // La configuración de crédito la resuelve el store desde lo local.
  fetchCreditSettings: jest.fn(async () => undefined),
  creditSettings: {
    formula_type: 'financed_balance',
    interest_rate_monthly_pct: 0,
    rounding_unit: 1000,
    money_decimal_places: 0,
    min_installments: 1,
    max_installments: 36,
    default_frequency: 'mensual',
    legal_text: null,
  },
  createAndActivate: mockCreateAndActivate,
};
jest.mock('@/components/negocios/infrastructure/store/negociosStore', () => ({
  useNegociosStore: () => mockNegociosStore,
}));

jest.mock('@/lib/users/sellersService', () => ({
  fetchSellerOptions: jest.fn(async () => {
    throw new Error('Network request failed');
  }),
  withCurrentUserOption: (sellers: unknown[], current: { id: string; name: string } | null) =>
    current ? [{ id: current.id, full_name: current.name || 'Yo' }] : sellers,
}));

jest.mock('@/lib/offline/repositories/deliveryOrdersRepository', () => ({
  listLocalOfflineOrders: jest.fn(async () => []),
  getLocalOfflineOrderLines: jest.fn(async () => []),
  listLocalPendingRemissions: jest.fn(async () => []),
  localOrdersSnapshotAt: jest.fn(async () => null),
  pendingLocalQuantitiesByOrigin: jest.fn(async () => new Map()),
}));

jest.mock('@/components/offline/infrastructure/syncPrefsService', () => ({
  useOfflineSelection: () => ({
    isSelected: () => false,
    toggle: jest.fn(),
    count: 0,
    mode: 'seleccion',
    supported: true,
  }),
}));

// El icono real carga la fuente de forma asíncrona y hace setState fuera de act(...).
jest.mock('@expo/vector-icons', () => {
  const ReactModule = jest.requireActual<typeof import('react')>('react');
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    MaterialIcons: ({ name }: { name: string }) => ReactModule.createElement(Text, null, name),
  };
});

jest.mock('@/components/customers', () => ({
  createCustomer: jest.fn(),
  fetchCustomerSavedLocation: jest.fn(async () => null),
  findCustomerByIdNumber: jest.fn(async () => null),
  isDuplicateCustomerIdNumber: () => false,
  searchCustomersForNegocio: jest.fn(async () => []),
}));

jest.mock('@/components/auth/infrastructure/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u1', email: 'vendedor@casaideal.co' } }),
}));

jest.mock('@/hooks/useUserRoles', () => ({ useUserRoles: () => ({ roles: [], isAdmin: () => false }) }));

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
}));

jest.mock('@react-navigation/native', () => ({ useFocusEffect: jest.fn() }));

/** Un teléfono Android con barra de navegación de 48 px. */
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return {
    SafeAreaView: ({ children, style }: any) => <View style={style}>{children}</View>,
    useSafeAreaInsets: () => ({ top: 0, bottom: 48, left: 0, right: 0 }),
  };
});

jest.mock('@/components/theme', () => ({ useTheme: () => ({ isDark: false }) }));

const snapshotAt = new Date('2026-09-25T07:15:00').getTime();

const remission = {
  id: 'rem-1',
  orderNumber: 'REM-0010',
  orderType: 'remission',
  status: 'approved',
  customerId: null,
  customerName: null,
  municipioId: null,
  veredaId: null,
  deliveryAddress: null,
  usable: true,
  unusableReason: null,
  snapshotAt,
};

const baseLine = {
  orderId: 'rem-1',
  groupKind: 'own',
  sourceOrderId: 'rem-1',
  sourceOrderNumber: 'REM-0010',
  sourceCustomerId: null,
  sourceCustomerName: null,
  sourceHasNegocio: false,
  productSku: null,
  warehouseId: 'w1',
  warehouseName: 'Principal',
};

const remissionLines = [
  { ...baseLine, productId: 'cama', productName: 'Cama doble', quantity: 5, availableQuantity: 5 },
  { ...baseLine, productId: 'nevera', productName: 'Nevera', quantity: 1, availableQuantity: 1 },
  {
    ...baseLine,
    groupKind: 'child',
    sourceOrderId: 'oe-7',
    sourceOrderNumber: 'OE-0007',
    sourceCustomerId: 'c-ana',
    sourceCustomerName: 'ANA RUIZ',
    productId: 'colchon',
    productName: 'Colchón',
    quantity: 2,
    availableQuantity: 2,
  },
];

describe('Asistente de negocio · órdenes y remisiones sin señal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useSyncStore.setState({ userId: 'u1', online: false });
    (listLocalOfflineOrders as jest.Mock).mockResolvedValue([]);
    (getLocalOfflineOrderLines as jest.Mock).mockResolvedValue([]);
    (listLocalPendingRemissions as jest.Mock).mockResolvedValue([]);
    (pendingLocalQuantitiesByOrigin as jest.Mock).mockResolvedValue(new Map());
  });

  const abrir = async () => {
    const screen = render(<NegocioCreateScreen />);
    await waitFor(() => expect(screen.getByTestId('negocio-create-sin-red')).toBeTruthy());
    return screen;
  };

  it('lista las órdenes llevadas con la hora de la foto y arma los grupos restando lo pendiente local', async () => {
    (listLocalOfflineOrders as jest.Mock).mockResolvedValue([remission]);
    (getLocalOfflineOrderLines as jest.Mock).mockResolvedValue(remissionLines);
    // Un negocio de este teléfono sin enviar ya se llevó la nevera.
    (pendingLocalQuantitiesByOrigin as jest.Mock).mockResolvedValue(new Map([['rem-1:nevera:w1', 1]]));

    const screen = await abrir();
    fireEvent.press(screen.getByText('Orden de entrega existente'));

    const card = await screen.findByTestId('origin-order-rem-1');
    expect(screen.getByTestId('origin-orders-local-hint').props.children).toMatch(/descargadas 7:15 a\. m\./);
    expect(screen.getByText('#REM-0010 · Remisión · sin asignar')).toBeTruthy();

    fireEvent.press(card);

    expect(await screen.findByText('Productos propios de la remisión')).toBeTruthy();
    expect(getLocalOfflineOrderLines).toHaveBeenCalledWith('rem-1');
    // Solo quedan las camas: la nevera la tomó el negocio pendiente.
    expect(screen.getAllByText('1 producto(s) disponible(s)').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('Productos de la OE-0007 (ANA RUIZ)')).toBeTruthy();
  });

  it('sin ninguna orden llevada avisa que hay que marcarlas con señal', async () => {
    const screen = await abrir();
    fireEvent.press(screen.getByText('Orden de entrega existente'));

    const aviso = await screen.findByTestId('origin-orders-none-local');
    expect(aviso.props.children).toMatch(/Con señal, pulse «Llevar en el teléfono»/);
  });

  it('«Enviar en remisión» ofrece las remisiones pendientes que bajaron al teléfono', async () => {
    (listLocalPendingRemissions as jest.Mock).mockResolvedValue([
      {
        id: 'rem-2',
        orderNumber: 'REM-0020',
        status: 'pending',
        createdAt: '2026-09-24T10:00:00Z',
        assignedToUserId: 'u-chofer',
        assignedUserName: 'PEDRO',
        nestedOrdersCount: 2,
      },
    ]);

    const screen = await abrir();
    fireEvent.press(screen.getByText('Enviar en remisión'));

    const option = await screen.findByText('REM-0020 · PEDRO');
    expect(screen.getByTestId('remisiones-desde-telefono')).toBeTruthy();
    fireEvent.press(option);
    await waitFor(() => expect(screen.getByText('check-circle')).toBeTruthy());
  });

  it('«Enviar en remisión» sin remisiones en el teléfono lo dice en vez de quedarse mudo', async () => {
    const screen = await abrir();
    fireEvent.press(screen.getByText('Enviar en remisión'));

    expect(await screen.findByTestId('sin-remisiones-en-telefono')).toBeTruthy();
    expect(screen.getByText(/No hay remisiones pendientes en el teléfono/)).toBeTruthy();
  });
});
