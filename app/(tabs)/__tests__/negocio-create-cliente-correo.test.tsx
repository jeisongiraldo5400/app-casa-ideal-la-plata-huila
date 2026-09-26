import { fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Alert } from 'react-native';

import NegocioCreateScreen from '../negocio-create';
import { useSyncStore } from '@/lib/offline/store/syncStore';

/**
 * «+ Crear cliente nuevo» del asistente de negocio: pide el correo electrónico
 * (opcional), lo valida solo si se escribe y lo envía recortado y en
 * minúsculas. Antes el formulario no tenía el campo.
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

const mockCreateCustomer = jest.fn();
jest.mock('@/components/customers', () => ({
  createCustomer: (input: unknown) => mockCreateCustomer(input),
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

describe('Asistente de negocio · crear cliente con correo', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useSyncStore.setState({ userId: 'u1', online: false });
    mockCreateCustomer.mockResolvedValue({
      id: 'c-nuevo',
      name: 'Ana Pérez',
      id_number: '1080123456',
      seller_id: 'u1',
      saved_offline: true,
    });
  });

  async function abrirFormulario() {
    const screen = render(<NegocioCreateScreen />);
    fireEvent.press(await screen.findByText('+ Crear cliente nuevo'));
    fireEvent.changeText(screen.getByPlaceholderText('Ej. Juan Carlos Pérez'), 'Ana Pérez');
    fireEvent.changeText(screen.getByPlaceholderText('Ej. 1080123456'), '1080123456');
    return screen;
  }

  it('muestra el campo de correo con teclado de correo y sin mayúsculas automáticas', async () => {
    const screen = await abrirFormulario();

    expect(screen.getByText('Correo electrónico (opcional)')).toBeTruthy();
    const campo = screen.getByPlaceholderText('Ej. cliente@correo.com');
    expect(campo.props.keyboardType).toBe('email-address');
    expect(campo.props.autoCapitalize).toBe('none');
  });

  it('envía el correo recortado y en minúsculas', async () => {
    const screen = await abrirFormulario();
    fireEvent.changeText(screen.getByPlaceholderText('Ej. cliente@correo.com'), '  Ana.Perez@Correo.COM ');
    fireEvent.press(screen.getByText('Guardar cliente'));

    await waitFor(() => expect(mockCreateCustomer).toHaveBeenCalled());
    expect(mockCreateCustomer).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Ana Pérez', idNumber: '1080123456', email: 'ana.perez@correo.com' })
    );
  });

  it('sin correo sigue creando el cliente con email null', async () => {
    const screen = await abrirFormulario();
    fireEvent.press(screen.getByText('Guardar cliente'));

    await waitFor(() => expect(mockCreateCustomer).toHaveBeenCalled());
    expect(mockCreateCustomer).toHaveBeenCalledWith(expect.objectContaining({ email: null }));
  });

  it('un correo mal escrito avisa y no crea el cliente', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const screen = await abrirFormulario();
    fireEvent.changeText(screen.getByPlaceholderText('Ej. cliente@correo.com'), 'ana@correo');
    fireEvent.press(screen.getByText('Guardar cliente'));

    await waitFor(() =>
      expect(alert).toHaveBeenCalledWith('Correo electrónico', 'El correo electrónico no tiene un formato válido')
    );
    expect(mockCreateCustomer).not.toHaveBeenCalled();
    alert.mockRestore();
  });
});
