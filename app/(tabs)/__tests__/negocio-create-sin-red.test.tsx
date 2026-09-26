import { render, waitFor } from '@testing-library/react-native';
import React from 'react';

import NegocioCreateScreen from '../negocio-create';
import { fetchLocationCatalogsFromLocal } from '@/lib/offline/repositories/catalogRepository';
import { useSyncStore } from '@/lib/offline/store/syncStore';

/**
 * Sin señal el asistente ya no se queda atascado en el primer paso: los
 * catálogos salen de la última descarga y la pantalla dice que el negocio
 * quedará pendiente de confirmar.
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
  formatLastDownloadTime: () => '10:30 a. m.',
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

jest.mock('@/components/negocios/infrastructure/services/negociosDeliveryOrdersService', () => ({
  fetchPendingRemissions: jest.fn(async () => {
    throw new Error('Network request failed');
  }),
  fetchRemissionOriginProducts: jest.fn(async () => []),
  stockMapFromDeliveryOrder: () => ({}),
  negocioSkipsWarehouseStock: () => false,
}));

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

jest.mock('@/hooks/useUserRoles', () => ({ useUserRoles: () => ({ roles: [], isAdmin: () => false, isVendedor: () => true }) }));

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

describe('Asistente de negocio · sin red', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useSyncStore.setState({ userId: 'u1', online: false });
  });

  it('carga con los catálogos de la última descarga en vez de bloquearse', async () => {
    const screen = render(<NegocioCreateScreen />);

    await waitFor(() => expect(fetchLocationCatalogsFromLocal).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.getByTestId('negocio-create-sin-red')).toBeTruthy()
    );
    expect(screen.queryByText('Reintentar')).toBeNull();
    expect(
      screen.getByText(/El negocio se guarda en el teléfono y se envía solo al volver la señal/)
    ).toBeTruthy();
  });

  it('sin nada descargado explica qué hacer en vez de dejar la pantalla muda', async () => {
    (fetchLocationCatalogsFromLocal as jest.Mock).mockResolvedValueOnce({
      departamentos: [],
      municipios: [],
      veredas: [],
    });

    const screen = render(<NegocioCreateScreen />);

    await waitFor(() =>
      expect(screen.getByText(/pulse «Descargar información»/)).toBeTruthy()
    );
    expect(screen.getByText('Reintentar')).toBeTruthy();
  });

  // Reportado con un vídeo del usuario (2026-09-24): en un Android de borde a
  // borde, «Guardar sin señal» quedaba DEBAJO de los botones del sistema y no
  // se podía pulsar. El pie tiene que apartarse él mismo.
  it('el pie se aparta de la barra de navegación de Android', async () => {
    const screen = render(<NegocioCreateScreen />);

    const pie = await screen.findByTestId('negocio-create-pie');
    const estilos = (Array.isArray(pie.props.style) ? pie.props.style : [pie.props.style])
      .filter(Boolean)
      .reduce((acc: Record<string, unknown>, capa: Record<string, unknown>) => ({ ...acc, ...capa }), {});

    expect(estilos.paddingBottom).toBeGreaterThanOrEqual(48);
  });
});
