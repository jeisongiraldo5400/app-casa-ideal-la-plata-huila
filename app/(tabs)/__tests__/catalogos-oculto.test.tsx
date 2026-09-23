import { render } from '@testing-library/react-native';
import React from 'react';

// Las pantallas se importan una sola vez: leen la bandera en cada render.
import CatalogoCreateScreen from '../catalogo-create';
import CatalogosScreen from '../catalogos';
import HomeScreen from '../index';

// La bandera se lee como getter para poder encenderla y apagarla por prueba.
let mockCatalogosHabilitados = false;
jest.mock('@/constants/features', () => ({
  get CATALOGOS_HABILITADOS() {
    return mockCatalogosHabilitados;
  },
}));

const mockNavigate = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockNavigate, navigate: mockNavigate }),
  useFocusEffect: jest.fn(),
  Redirect: ({ href }: { href: string }) => {
    const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
    return <Text testID="redirect">{String(href)}</Text>;
  },
}));

jest.mock('@/components/theme', () => ({
  useTheme: () => ({ isDark: false }),
}));

jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    SafeAreaView: View,
    useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
  };
});

jest.mock('@/components/auth/infrastructure/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1', email: 'vendedor@casaideal.test' } }),
}));

jest.mock('@/hooks/useDashboardStats', () => ({
  useDashboardStats: () => ({ pendingOrders: 0, pendingDeliveryOrders: 0, loading: false }),
}));

// Usuario con rol de catálogo: sin la bandera, igual no debe ver el módulo.
jest.mock('@/hooks/useUserRoles', () => ({
  useUserRoles: () => ({
    roles: [],
    loading: false,
    isAdmin: () => false,
    isVendedor: () => true,
    isGestorCobro: () => false,
    isRecaudador: () => false,
    canAccessCatalogs: () => true,
  }),
}));

describe('Catálogos ocultos en la app móvil', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCatalogosHabilitados = false;
  });

  it('no muestra los accesos de catálogos en el inicio con la bandera apagada', () => {
    const screen = render(<HomeScreen />);

    expect(screen.queryByText('Catálogos')).toBeNull();
    expect(screen.queryByText('Nuevo catálogo')).toBeNull();
    // El resto del inicio sigue en pie.
    expect(screen.getByText('Operaciones de almacén')).toBeTruthy();
  });

  it('muestra los accesos de catálogos en el inicio con la bandera encendida', () => {
    mockCatalogosHabilitados = true;

    const screen = render(<HomeScreen />);

    expect(screen.getAllByText('Catálogos').length).toBeGreaterThan(0);
    expect(screen.getByText('Nuevo catálogo')).toBeTruthy();
  });

  it('redirige al inicio si se abre la ruta de catálogos con la bandera apagada', () => {
    const screen = render(<CatalogosScreen />);

    expect(screen.getByTestId('redirect')).toHaveTextContent('/(tabs)');
  });

  it('redirige al inicio si se abre la ruta de crear catálogo con la bandera apagada', () => {
    const screen = render(<CatalogoCreateScreen />);

    expect(screen.getByTestId('redirect')).toHaveTextContent('/(tabs)');
  });
});
