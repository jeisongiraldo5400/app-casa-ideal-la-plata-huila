import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';
import CatalogoCreateScreen from '../catalogo-create';

jest.mock('@/constants/features', () => ({ CATALOGOS_HABILITADOS: true }));

const mockCalls: string[] = [];
const mockRouter = {
  navigate: jest.fn((href: string) => mockCalls.push(`navigate ${href}`)),
  push: jest.fn((href: string) => mockCalls.push(`push ${href}`)),
  replace: jest.fn((href: string) => mockCalls.push(`replace ${href}`)),
  back: jest.fn(() => mockCalls.push('back')),
  canGoBack: jest.fn(() => true),
};
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useFocusEffect: jest.fn(),
  Redirect: () => null,
}));

jest.mock('@/components/theme', () => ({ useTheme: () => ({ isDark: false }) }));

jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) };
});

jest.mock('@/components/catalogos/infrastructure/hooks/useCatalogAccess', () => ({
  useCatalogAccess: () => ({ canAccessCatalogs: true, canManageCatalog: true, canCreateShareLink: true, loading: false }),
}));

const mockCreate = jest.fn();
jest.mock('@/components/catalogos/infrastructure/services/catalogsService', () => ({
  ...jest.requireActual('@/components/catalogos/infrastructure/services/catalogsService'),
  createPrivateCatalog: (...args: unknown[]) => mockCreate(...args),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockCalls.length = 0;
});

describe('Nuevo catálogo: navegación tras crear', () => {
  it('deja la pila en pestañas (Catálogos) → Detalle → Productos sin reemplazar las pestañas, y limpia el formulario', async () => {
    mockCreate.mockResolvedValueOnce({ id: 'cat-9' });
    const screen = render(<CatalogoCreateScreen />);

    fireEvent.changeText(screen.getByPlaceholderText('P. ej. Apartamentos septiembre'), 'Temporada alta');
    await act(async () => {
      fireEvent.press(screen.getByText('Crear y elegir productos'));
    });

    await waitFor(() => expect(mockCalls).toHaveLength(3));
    expect(mockCreate).toHaveBeenCalledWith({ internalTitle: 'Temporada alta' });
    expect(mockCalls).toEqual(['navigate /(tabs)/catalogos', 'push /catalogo/cat-9', 'push /catalogo/cat-9/productos']);
    expect(mockRouter.replace).not.toHaveBeenCalled();
    // La pestaña no se desmonta: al volver debe estar vacía.
    expect(screen.getByPlaceholderText('P. ej. Apartamentos septiembre').props.value).toBe('');
  });

  it('si falla la creación no navega y muestra el error', async () => {
    mockCreate.mockRejectedValueOnce(new Error('sin permiso'));
    const screen = render(<CatalogoCreateScreen />);

    fireEvent.changeText(screen.getByPlaceholderText('P. ej. Apartamentos septiembre'), 'Temporada alta');
    await act(async () => {
      fireEvent.press(screen.getByText('Crear y elegir productos'));
    });

    await waitFor(() => expect(screen.getByText(/sin permiso/)).toBeTruthy());
    expect(mockCalls).toEqual([]);
  });
});
