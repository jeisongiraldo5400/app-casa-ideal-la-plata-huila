import { render } from '@testing-library/react-native';
import React from 'react';

import HomeScreen from '../index';

let mockStats: {
  pendingOrders: number | null;
  pendingDeliveryOrders: number | null;
  loading: boolean;
  error: string | null;
};
const mockReload = jest.fn();

jest.mock('@/hooks/useDashboardStats', () => ({
  useDashboardStats: () => ({ ...mockStats, reload: mockReload }),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), navigate: jest.fn() }),
  useFocusEffect: jest.fn(),
}));

jest.mock('@/components/theme', () => ({
  useTheme: () => ({ isDark: false }),
}));

jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) };
});

jest.mock('@/components/auth/infrastructure/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1', email: 'bodeguero@casaideal.test' } }),
}));

let mockRoleNames: string[] = ['admin'];
jest.mock('@/hooks/useUserRoles', () => ({
  useUserRoles: () => {
    const has = (name: string) => mockRoleNames.includes(name);
    return {
      roles: mockRoleNames.map((nombre) => ({ role: { nombre } })),
      loading: false,
      isAdmin: () => has('admin'),
      isVendedor: () => has('vendedor'),
      isGestorCobro: () => has('gestor de cobro'),
      isRecaudador: () => has('recaudador'),
      canAccessCatalogs: () => false,
    };
  },
}));

let mockOnline = true;
jest.mock('@/hooks/useNetworkStatus', () => ({ useNetworkStatus: () => mockOnline }));
jest.mock('@react-navigation/native', () => ({ useIsFocused: () => true }));

describe('Inicio · resumen de hoy', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRoleNames = ['admin'];
    mockOnline = true;
  });

  it('sin conexión muestra «—» y avisa, nunca un cero inventado', () => {
    mockStats = {
      pendingOrders: null,
      pendingDeliveryOrders: null,
      loading: false,
      error: 'Sin conexión con el servidor. Revisa tu red e inténtalo de nuevo.',
    };

    const screen = render(<HomeScreen />);

    expect(screen.getAllByText('—')).toHaveLength(2);
    expect(screen.queryByText('0')).toBeNull();
    expect(
      screen.getByText('Sin conexión: no se pudo consultar el resumen. Toca para reintentar.')
    ).toBeTruthy();
    expect(screen.getByText('Sin consultar')).toBeTruthy();
  });

  it('un cero real del servidor sí se muestra, sin aviso', () => {
    mockStats = { pendingOrders: 0, pendingDeliveryOrders: 0, loading: false, error: null };

    const screen = render(<HomeScreen />);

    expect(screen.getAllByText('0')).toHaveLength(2);
    expect(screen.queryByText(/Toca para reintentar/)).toBeNull();
    expect(screen.getByText('Pendientes')).toBeTruthy();
  });

  it('mientras carga muestra «—» sin acusar de un fallo', () => {
    mockStats = { pendingOrders: null, pendingDeliveryOrders: null, loading: true, error: null };

    const screen = render(<HomeScreen />);

    expect(screen.getAllByText('—')).toHaveLength(2);
    expect(screen.getByText('Actualizando…')).toBeTruthy();
  });
});

describe('Inicio · operaciones de almacén por rol', () => {
  beforeEach(() => {
    mockStats = { pendingOrders: 1, pendingDeliveryOrders: 2, loading: false, error: null };
    mockOnline = true;
  });

  const cards = (screen: ReturnType<typeof render>) =>
    ['Salidas', 'Entradas', 'Mis órdenes', 'Todas', 'Órdenes de compra'].filter((title) => screen.queryByText(title));

  it('admin y bodeguero ven todo', () => {
    mockRoleNames = ['bodeguero'];
    expect(cards(render(<HomeScreen />))).toEqual(['Salidas', 'Entradas', 'Mis órdenes', 'Todas', 'Órdenes de compra']);
  });

  it('el vendedor ve sus salidas asignadas y las órdenes, pero no Entradas ni compras', () => {
    mockRoleNames = ['vendedor'];
    const screen = render(<HomeScreen />);
    expect(cards(screen)).toEqual(['Salidas', 'Mis órdenes', 'Todas']);
    expect(screen.getByText('De tus órdenes asignadas')).toBeTruthy();
  });

  it('el recaudador solo consulta órdenes de entrega: sin Salidas, Entradas ni compras', () => {
    mockRoleNames = ['recaudador'];
    expect(cards(render(<HomeScreen />))).toEqual(['Todas']);
  });

  it('sin señal lo dice en vez de quedarse en «Pendientes»', () => {
    mockOnline = false;
    mockRoleNames = ['admin'];
    const screen = render(<HomeScreen />);
    expect(screen.getByText('Sin señal')).toBeTruthy();
    expect(screen.getByText('Sin conexión: el resumen se actualiza al volver la señal.')).toBeTruthy();
  });
});
