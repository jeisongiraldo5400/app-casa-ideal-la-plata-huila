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

jest.mock('@/hooks/useUserRoles', () => ({
  useUserRoles: () => ({
    roles: [],
    loading: false,
    isAdmin: () => true,
    isVendedor: () => false,
    isGestorCobro: () => false,
    isRecaudador: () => false,
    canAccessCatalogs: () => false,
  }),
}));

describe('Inicio · resumen de hoy', () => {
  beforeEach(() => jest.clearAllMocks());

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
