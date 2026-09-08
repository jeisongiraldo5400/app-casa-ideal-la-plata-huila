import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { NegocioProductAddSection } from '../NegocioProductAddSection';
import { findActiveProductByBarcode } from '../../infrastructure/services/negociosProductsService';
import { fetchProductWarehouseStock } from '../../infrastructure/services/negociosStockService';

jest.mock('@/components/scanning', () => {
  const ReactModule = jest.requireActual<typeof import('react')>('react');
  const { Pressable, Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    BarcodeScanner: ({ onScan }: { onScan: (barcode: string) => void }) =>
      ReactModule.createElement(
        Pressable,
        { onPress: () => void onScan('770123') },
        ReactModule.createElement(Text, null, 'Simular escaneo')
      ),
  };
});

jest.mock('../../infrastructure/services/negociosProductsService', () => ({
  findActiveProductByBarcode: jest.fn(),
}));

jest.mock('../../infrastructure/services/negociosStockService', () => {
  const actual = jest.requireActual('../../infrastructure/services/negociosStockService');
  return { ...actual, fetchProductWarehouseStock: jest.fn() };
});

const colors = {
  text: { primary: '#111827', secondary: '#6b7280' },
  primary: { main: '#1e3a8a', contrastText: '#ffffff' },
  background: { default: '#f7f5f1', paper: '#ffffff' },
  divider: '#d1d5db',
};

const product = {
  id: 'product-1', name: 'Nevera', sku: 'NEV-1', barcode: '770123', sale_price: 2_000_000,
};

function renderSection(options: { products?: typeof product[]; productQuery?: string } = {}) {
  return render(
    <NegocioProductAddSection
      products={options.products || []}
      productQuery={options.productQuery || ''}
      onProductQueryChange={jest.fn()}
      items={[]}
      onAdd={jest.fn()}
      onStockLoaded={jest.fn()}
      colors={colors}
    />
  );
}

describe('NegocioProductAddSection scanner', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (fetchProductWarehouseStock as jest.Mock).mockResolvedValue([
      { warehouse_id: 'warehouse-1', warehouse_name: 'Principal', quantity: 5 },
    ]);
  });

  it('selecciona el producto escaneado y abre el formulario sin agregarlo', async () => {
    (findActiveProductByBarcode as jest.Mock).mockResolvedValue(product);
    const screen = renderSection();

    fireEvent.press(screen.getByLabelText('Escanear código de barras'));
    await act(async () => fireEvent.press(screen.getByText('Simular escaneo')));

    await waitFor(() => expect(screen.getByText('Nevera')).toBeTruthy());
    expect(screen.getByText('Principal (5)')).toBeTruthy();
    expect(screen.getByText('$ 2.000.000')).toBeTruthy();
  });

  it('mantiene el escáner disponible cuando el código no existe', async () => {
    (findActiveProductByBarcode as jest.Mock).mockResolvedValue(null);
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const screen = renderSection();

    fireEvent.press(screen.getByLabelText('Escanear código de barras'));
    await act(async () => fireEvent.press(screen.getByText('Simular escaneo')));

    expect(alert).toHaveBeenCalledWith(
      'Producto no encontrado',
      expect.stringContaining('770123'),
      expect.any(Array)
    );
    expect(screen.getByText('Simular escaneo')).toBeTruthy();
  });

  it('muestra resultados de búsqueda manual por SKU o código', () => {
    expect(renderSection({ products: [product], productQuery: 'NEV-1' }).getByText('Nevera')).toBeTruthy();
    expect(renderSection({ products: [product], productQuery: '770123' }).getByText('Nevera')).toBeTruthy();
  });
});
