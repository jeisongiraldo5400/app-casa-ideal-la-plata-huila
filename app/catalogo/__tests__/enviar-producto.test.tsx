import { act, fireEvent, render } from '@testing-library/react-native';
import React from 'react';

import EnviarProductoScreen from '../enviar-producto';
import { shareProducts } from '@/components/catalogos/infrastructure/services/quickShareService';

jest.mock('@/constants/features', () => ({ CATALOGOS_HABILITADOS: true }));
jest.mock('@/components/theme', () => ({ useTheme: () => ({ isDark: false }) }));
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) };
});
jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return { MaterialIcons: ({ name }: { name: string }) => <Text>{name}</Text> };
});
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  Redirect: () => null,
  useRouter: () => ({ back: jest.fn(), canGoBack: () => true, replace: jest.fn() }),
}));

function mockFicha(productId: string) {
  return {
    catalogProductId: `cp-${productId}`,
    productId,
    slug: productId,
    displayName: `Producto ${productId}`,
    shortDescription: null,
    stockQuantity: 1,
    categoryId: null,
    categoryName: null,
    brandName: null,
    isFeatured: false,
    coverImageUrl: null,
    publishedAt: null,
  };
}

// 7 productos publicados, 5 por página como en la app (dos páginas).
const mockTodos = Array.from({ length: 7 }, (_, index) => mockFicha(String(index + 1)));
let mockMax = 30;

jest.mock('@/components/catalogos/infrastructure/hooks/usePublishedProductSearch', () => ({
  usePublishedProductSearch: () => {
    const { useState } = jest.requireActual<typeof import('react')>('react');
    const [page, setPage] = useState(0);
    const [query, setQuery] = useState('');
    const matching = mockTodos.filter((item) => item.displayName.includes(query));
    return {
      query,
      setQuery: (value: string) => {
        setQuery(value);
        setPage(0);
      },
      page,
      setPage,
      pageSize: 5,
      items: matching.slice(page * 5, page * 5 + 5),
      totalCount: matching.length,
      loading: false,
      error: null,
      reload: jest.fn(),
    };
  },
}));

jest.mock('@/components/catalogos/infrastructure/hooks/useProductSelection', () => {
  const actual = jest.requireActual('@/components/catalogos/infrastructure/hooks/useProductSelection');
  return { useProductSelection: () => actual.useProductSelection(mockMax) };
});

jest.mock('@/components/catalogos', () => {
  const { Pressable, Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    useCatalogAccess: () => ({ loading: false, canManageCatalog: true, canCreateShareLink: true }),
    useCatalogosStore: (selector: (state: { fetchList: jest.Mock }) => unknown) => selector({ fetchList: jest.fn() }),
    CatalogImageViewer: () => null,
    ShareLinkResultSheet: () => null,
    ProductPickerRow: ({ item, selected, onToggle }: { item: { productId: string; displayName: string }; selected: boolean; onToggle: () => void }) => (
      <Pressable onPress={onToggle} testID={`fila-${item.productId}`}>
        <Text>{`${item.displayName}${selected ? ' ✓' : ''}`}</Text>
      </Pressable>
    ),
    ShareLinkCreateForm: ({ onCreate }: { onCreate: (input: { label: string; hours: number; delivery: string }) => Promise<boolean> }) => (
      <Pressable onPress={() => void onCreate({ label: 'Nancy', hours: 168, delivery: 'none' })}>
        <Text>Generar</Text>
      </Pressable>
    ),
  };
});

jest.mock('@/components/catalogos/infrastructure/services/quickShareService', () => ({
  shareProducts: jest.fn(async () => ({ catalogId: 'c', url: 'https://x/c/tok', expiresAt: '2026-10-01', publicTitle: 'X' })),
}));
jest.mock('@/components/catalogos/utils/shareActions', () => ({ shareLinkByWhatsApp: jest.fn() }));

describe('Enviar productos por WhatsApp', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockMax = 30;
  });

  it('la selección se conserva al cambiar de página y al buscar', () => {
    const screen = render(<EnviarProductoScreen />);
    expect(screen.getByText('Elige al menos un producto')).toBeTruthy();

    fireEvent.press(screen.getByTestId('fila-1'));
    fireEvent.press(screen.getByTestId('fila-2'));
    expect(screen.getByText('2 seleccionados · Continuar')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Página siguiente'));
    fireEvent.press(screen.getByTestId('fila-6'));
    expect(screen.getByText('3 seleccionados · Continuar')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Página anterior'));
    expect(screen.getByText('Producto 1 ✓')).toBeTruthy();

    fireEvent.changeText(screen.getByPlaceholderText('Buscar producto'), 'Producto 7');
    fireEvent.press(screen.getByTestId('fila-7'));
    expect(screen.getByText('4 seleccionados · Continuar')).toBeTruthy();
  });

  it('al llegar al tope no añade más y lo dice', () => {
    mockMax = 2;
    const screen = render(<EnviarProductoScreen />);
    fireEvent.press(screen.getByTestId('fila-1'));
    fireEvent.press(screen.getByTestId('fila-2'));
    fireEvent.press(screen.getByTestId('fila-3'));
    expect(screen.getByText('2 seleccionados · Continuar')).toBeTruthy();
    expect(screen.getByText('Máximo 2 productos por envío. Quita alguno para añadir otro.')).toBeTruthy();
    expect(screen.queryByText('Producto 3 ✓')).toBeNull();
  });

  it('en el resumen se puede quitar y se envía todo en un solo enlace', async () => {
    const screen = render(<EnviarProductoScreen />);
    fireEvent.press(screen.getByTestId('fila-1'));
    fireEvent.press(screen.getByTestId('fila-2'));
    fireEvent.press(screen.getByTestId('fila-3'));
    fireEvent.press(screen.getByText('3 seleccionados · Continuar'));

    expect(screen.getByText('Vas a enviar 3 productos')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Quitar Producto 2'));
    expect(screen.getByText('Vas a enviar 2 productos')).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByText('Generar'));
    });
    expect(shareProducts).toHaveBeenCalledTimes(1);
    const [input] = (shareProducts as jest.Mock).mock.calls[0];
    expect(input.products.map((item: { productId: string }) => item.productId)).toEqual(['1', '3']);
    expect(input.label).toBe('Nancy');
  });

  it('si se quitan todos desde el resumen, vuelve a elegir', () => {
    const screen = render(<EnviarProductoScreen />);
    fireEvent.press(screen.getByTestId('fila-4'));
    fireEvent.press(screen.getByText('1 seleccionado · Continuar'));
    fireEvent.press(screen.getByLabelText('Quitar Producto 4'));
    expect(screen.getByText('Elige al menos un producto')).toBeTruthy();
    expect(screen.getByTestId('fila-1')).toBeTruthy();
  });
});
