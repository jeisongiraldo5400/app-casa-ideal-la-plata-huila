import { render, screen } from '@testing-library/react-native';
import React from 'react';
import CostAlertScreen from '../aviso/[negocioId]';

let mockParams: Record<string, string | undefined> = { negocioId: 'n-7' };
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ back: jest.fn(), replace: jest.fn(), canGoBack: () => true }),
}));
let mockRoleNames: string[] = ['costos'];
let mockRolesLoading = false;
jest.mock('@/hooks/useUserRoles', () => ({
  useUserRoles: () => ({
    roles: mockRoleNames.map((nombre) => ({ role: { nombre } })),
    loading: mockRolesLoading,
  }),
}));
jest.mock('@/components/negocios/components/CostosOnlyNegocioView', () => {
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  const ReactModule = jest.requireActual<typeof import('react')>('react');
  return {
    CostosOnlyNegocioScreen: ({ negocioId }: { negocioId: string }) =>
      ReactModule.createElement(Text, null, `costos de ${negocioId}`),
  };
});
jest.mock('@/components/theme', () => ({ useTheme: () => ({ isDark: false }) }));
jest.mock('@expo/vector-icons', () => {
  const ReactModule = jest.requireActual<typeof import('react')>('react');
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return { MaterialIcons: ({ name }: { name: string }) => ReactModule.createElement(Text, null, name) };
});

describe('Pantalla del aviso de costos (/costos/aviso/[negocioId])', () => {
  beforeEach(() => {
    mockParams = { negocioId: 'n-7' };
    mockRoleNames = ['costos'];
    mockRolesLoading = false;
  });

  it('con el perfil costos muestra el costo del negocio, aunque tenga otro rol', () => {
    mockRoleNames = ['admin', 'costos'];
    render(<CostAlertScreen />);
    expect(screen.getByText('costos de n-7')).toBeTruthy();
  });

  it('sin el perfil costos: sin acceso', () => {
    mockRoleNames = ['vendedor'];
    render(<CostAlertScreen />);
    expect(screen.getByText('Sin acceso')).toBeTruthy();
    expect(screen.queryByText(/costos de/)).toBeNull();
  });

  it('mientras cargan los perfiles no niega el acceso', () => {
    mockRoleNames = [];
    mockRolesLoading = true;
    render(<CostAlertScreen />);
    expect(screen.queryByText('Sin acceso')).toBeNull();
    expect(screen.getByText('Cargando…')).toBeTruthy();
  });
});
