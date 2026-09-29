import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';

import CatalogosScreen from '../catalogos';

jest.mock('@/constants/features', () => ({ CATALOGOS_HABILITADOS: true }));
jest.mock('@/components/theme', () => ({ useTheme: () => ({ isDark: false }) }));
jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return { MaterialIcons: ({ name }: { name: string }) => <Text>{name}</Text> };
});

function mockItem(overrides: Record<string, unknown>) {
  return {
    id: 'x',
    ownerId: 'yo',
    internalTitle: 'Catálogo',
    publicTitle: 'Catálogo',
    status: 'published',
    visibility: 'private',
    linkCount: 1,
    activeLinkCount: 1,
    isOwner: true,
    scope: 'own',
    ...overrides,
  };
}

const mockList = [
  mockItem({ id: 'b1', internalTitle: 'Sala borrador', status: 'draft', linkCount: 0, activeLinkCount: 0 }),
  mockItem({ id: 'b2', internalTitle: 'Cocina borrador', status: 'draft', linkCount: 0, activeLinkCount: 0 }),
  mockItem({ id: 'p1', internalTitle: 'Alcobas publicado' }),
  mockItem({ id: 'v1', internalTitle: 'Comedor vencido', linkCount: 2, activeLinkCount: 0 }),
  mockItem({ id: 'q1', internalTitle: 'Envío rápido · Nevera' }),
  mockItem({ id: 'g1', internalTitle: 'Global de la empresa', isOwner: false, scope: 'organization', visibility: 'organization', ownerId: 'admin' }),
  // Privado ajeno (lo trae la RLS al admin): no aparece en ninguna pestaña.
  mockItem({ id: 'x1', internalTitle: 'Privado ajeno', isOwner: false, scope: 'shared', ownerId: 'otro' }),
];

jest.mock('@/components/catalogos', () => {
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    useCatalogosStore: () => ({ list: mockList, loading: false, error: null, fetchList: jest.fn() }),
    useCatalogAccess: () => ({ loading: false, canAccessCatalogs: true, canManageCatalog: true, canCreateShareLink: true }),
    CatalogListCard: ({ item }: { item: { internalTitle: string } }) => <Text>{item.internalTitle}</Text>,
  };
});

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, navigate: jest.fn() }),
  useFocusEffect: jest.fn(),
  Redirect: () => null,
}));

describe('Catálogos · pestañas y estados', () => {
  it('«Mis catálogos» muestra solo lo propio, con la relación de borradores y publicados', () => {
    const screen = render(<CatalogosScreen />);

    expect(screen.getByText('Mis catálogos')).toBeTruthy();
    expect(screen.getByText('Globales')).toBeTruthy();
    // 5 propios (4 + 1 envío rápido) y 1 global.
    expect(screen.getByText('5')).toBeTruthy();
    expect(screen.getByText('1')).toBeTruthy();
    expect(screen.getByText('2 borradores · 2 publicados · 1 vencido')).toBeTruthy();

    expect(screen.getByText('Sala borrador')).toBeTruthy();
    expect(screen.queryByText('Global de la empresa')).toBeNull();
    expect(screen.queryByText('Privado ajeno')).toBeNull();
    // Envíos rápidos plegados.
    expect(screen.getByText('Envíos rápidos (1)')).toBeTruthy();
    expect(screen.queryByText('Envío rápido · Nevera')).toBeNull();
  });

  it('filtra por estado', () => {
    const screen = render(<CatalogosScreen />);

    fireEvent.press(screen.getByText('Borradores'));
    expect(screen.getByText('Sala borrador')).toBeTruthy();
    expect(screen.getByText('Cocina borrador')).toBeTruthy();
    expect(screen.queryByText('Alcobas publicado')).toBeNull();

    fireEvent.press(screen.getByText('Vencidos'));
    expect(screen.getByText('Comedor vencido')).toBeTruthy();
    expect(screen.queryByText('Sala borrador')).toBeNull();

    fireEvent.press(screen.getByText('Publicados'));
    expect(screen.getByText('Alcobas publicado')).toBeTruthy();
    expect(screen.queryByText('Comedor vencido')).toBeNull();
  });

  it('«Globales» muestra lo publicado para todos por otras personas, en su propia lista', () => {
    const screen = render(<CatalogosScreen />);

    fireEvent.press(screen.getByText('Globales'));

    expect(screen.getByText('Global de la empresa')).toBeTruthy();
    expect(screen.queryByText('Sala borrador')).toBeNull();
    expect(screen.queryByText('Envíos rápidos (1)')).toBeNull();
    expect(screen.queryByText('Borradores')).toBeNull();
    expect(screen.queryByLabelText('Nuevo catálogo')).toBeNull();
  });

  it('el acceso directo abre «Enviar productos»', () => {
    const screen = render(<CatalogosScreen />);
    fireEvent.press(screen.getByText('Enviar productos'));
    expect(mockPush).toHaveBeenCalledWith('/catalogo/enviar-producto');
  });
});
