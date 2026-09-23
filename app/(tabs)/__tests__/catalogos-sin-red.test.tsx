import { render } from '@testing-library/react-native';
import React from 'react';

import CatalogosScreen from '../catalogos';

// El módulo está oculto por bandera: se enciende para poder pintar la lista.
jest.mock('@/constants/features', () => ({ CATALOGOS_HABILITADOS: true }));

let mockError: string | null = null;
const mockFetchList = jest.fn();

jest.mock('@/components/catalogos', () => ({
  useCatalogosStore: () => ({ list: [], loading: false, error: mockError, fetchList: mockFetchList }),
  useCatalogAccess: () => ({ loading: false, canAccessCatalogs: true, canManageCatalog: true }),
  CatalogListCard: () => null,
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), navigate: jest.fn() }),
  useFocusEffect: jest.fn(),
  Redirect: () => null,
}));

jest.mock('@/components/theme', () => ({ useTheme: () => ({ isDark: false }) }));

describe('Catálogos · sin red', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockError = null;
  });

  it('con el mensaje ya traducido reconoce la falta de red (antes era código muerto)', () => {
    mockError = 'Sin conexión con el servidor. Revisa tu red e inténtalo de nuevo.';

    const screen = render(<CatalogosScreen />);

    expect(screen.getByText('Sin conexión')).toBeTruthy();
    expect(
      screen.getByText('Los catálogos requieren internet. Revisa la conexión e inténtalo de nuevo.')
    ).toBeTruthy();
  });

  it('otro fallo sigue mostrando su propio mensaje', () => {
    mockError = 'No tiene permiso para realizar esta acción.';

    const screen = render(<CatalogosScreen />);

    expect(screen.getByText('No se pudieron cargar los catálogos')).toBeTruthy();
    expect(screen.getByText('No tiene permiso para realizar esta acción.')).toBeTruthy();
  });
});
