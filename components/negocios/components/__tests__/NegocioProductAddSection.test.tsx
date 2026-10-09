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

// El Icon real carga la fuente de forma asíncrona y hace setState fuera de act(...).
jest.mock('@expo/vector-icons', () => {
  const ReactModule = jest.requireActual<typeof import('react')>('react');
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    MaterialIcons: ({ name }: { name: string }) => ReactModule.createElement(Text, null, name),
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
  id: 'product-1', name: 'Nevera', sku: 'NEV-1', barcode: '770123',
};

function renderSection(
  options: { products?: typeof product[]; productQuery?: string; onAdd?: jest.Mock } = {}
) {
  return render(
    <NegocioProductAddSection
      products={options.products || []}
      productQuery={options.productQuery || ''}
      onProductQueryChange={jest.fn()}
      items={[]}
      onAdd={options.onAdd || jest.fn()}
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
    // Sin precio de venta: el valor unitario queda vacío para que lo escriba el usuario.
    expect(screen.getByLabelText('Valor unitario').props.value).toBe('');
  });

  it('no agrega sin valor unitario y agrega con el valor que escribe el usuario', async () => {
    (findActiveProductByBarcode as jest.Mock).mockResolvedValue(product);
    const onAdd = jest.fn();
    const screen = renderSection({ onAdd });

    fireEvent.press(screen.getByLabelText('Escanear código de barras'));
    await act(async () => fireEvent.press(screen.getByText('Simular escaneo')));
    await waitFor(() => expect(screen.getByText('Principal (5)')).toBeTruthy());

    fireEvent.press(screen.getByText('Agregar'));
    expect(onAdd).not.toHaveBeenCalled();

    fireEvent.changeText(screen.getByLabelText('Valor unitario'), '1500000');
    fireEvent.press(screen.getByText('Agregar'));
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ quantity: 1, unit_price: 1_500_000 }));
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

  it.each(['1.5', '1,5', '1.000'])(
    'con cantidad «%s» muestra el error y no agrega (nunca 15, 1 ni 1000)',
    async (typed) => {
      (findActiveProductByBarcode as jest.Mock).mockResolvedValue(product);
      const onAdd = jest.fn();
      const screen = renderSection({ onAdd });

      fireEvent.press(screen.getByLabelText('Escanear código de barras'));
      await act(async () => fireEvent.press(screen.getByText('Simular escaneo')));
      await waitFor(() => expect(screen.getByText('Principal (5)')).toBeTruthy());

      const qty = screen.getByLabelText('Cantidad');
      fireEvent.changeText(screen.getByLabelText('Valor unitario'), '2000000');
      fireEvent.changeText(qty, typed);

      expect(qty.props.value).toBe(typed);
      expect(screen.getByText('La cantidad debe ser un número entero')).toBeTruthy();
      fireEvent.press(screen.getByText('Agregar'));
      expect(onAdd).not.toHaveBeenCalled();

      fireEvent.changeText(qty, '2');
      expect(screen.queryByText('La cantidad debe ser un número entero')).toBeNull();
      fireEvent.press(screen.getByText('Agregar'));
      expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ quantity: 2 }));
    }
  );
});

describe('NegocioProductAddSection · producto que no está en el teléfono', () => {
  const { productoNoEstaEnElTelefono } = jest.requireActual(
    '../../infrastructure/services/negociosProductsService'
  ) as typeof import('../../infrastructure/services/negociosProductsService');

  it('sin señal y sin coincidencias dice que no está en el teléfono y cómo traerlo', () => {
    const screen = render(
      <NegocioProductAddSection
        products={[]}
        productQuery="comedor"
        onProductQueryChange={jest.fn()}
        items={[]}
        onAdd={jest.fn()}
        onStockLoaded={jest.fn()}
        emptyMessage={productoNoEstaEnElTelefono('comedor')}
        colors={colors}
      />
    );

    expect(screen.getByTestId('negocio-product-not-on-phone').props.children).toBe(
      '«comedor» no está en el teléfono: no vino en la última descarga. Si es nuevo, con señal pulse «Descargar» en Preparar el teléfono.'
    );
  });

  it('con coincidencias no avisa', () => {
    const screen = render(
      <NegocioProductAddSection
        products={[product]}
        productQuery="nev"
        onProductQueryChange={jest.fn()}
        items={[]}
        onAdd={jest.fn()}
        onStockLoaded={jest.fn()}
        emptyMessage="no debería verse"
        colors={colors}
      />
    );

    expect(screen.queryByTestId('negocio-product-not-on-phone')).toBeNull();
    expect(screen.getByText('Nevera')).toBeTruthy();
  });
});

describe('NegocioProductAddSection · bodegas de venta', () => {
  const soloAndes = { restricted: true as const, allowedIds: ['warehouse-2'] };

  function renderRestricted(onStockLoaded = jest.fn()) {
    return render(
      <NegocioProductAddSection
        products={[product]}
        productQuery="nev"
        onProductQueryChange={jest.fn()}
        items={[]}
        onAdd={jest.fn()}
        onStockLoaded={onStockLoaded}
        saleAccess={soloAndes}
        colors={colors}
      />
    );
  }

  beforeEach(() => jest.clearAllMocks());

  it('pide el stock con el acceso y autoselecciona la bodega permitida', async () => {
    // El servicio ya devuelve solo las bodegas permitidas.
    (fetchProductWarehouseStock as jest.Mock).mockResolvedValue([
      { warehouse_id: 'warehouse-2', warehouse_name: 'Andes', quantity: 2 },
    ]);
    const onStockLoaded = jest.fn();
    const screen = renderRestricted(onStockLoaded);

    fireEvent.press(screen.getByText('Nevera'));
    await waitFor(() => expect(screen.getByText('Andes (2)')).toBeTruthy());

    expect(fetchProductWarehouseStock).toHaveBeenCalledWith('product-1', soloAndes);
    expect(onStockLoaded).toHaveBeenCalledWith('product-1', [
      { warehouse_id: 'warehouse-2', warehouse_name: 'Andes', quantity: 2 },
    ]);
    expect(screen.queryByText(/Principal/)).toBeNull();
  });

  it('sin existencias en sus bodegas lo dice así', async () => {
    (fetchProductWarehouseStock as jest.Mock).mockResolvedValue([]);
    const screen = renderRestricted();

    fireEvent.press(screen.getByText('Nevera'));
    await waitFor(() =>
      expect(screen.getByText('Sin existencias en tus bodegas de venta')).toBeTruthy()
    );
  });

  it('el escáner busca con el acceso y explica que no está en sus bodegas', async () => {
    (findActiveProductByBarcode as jest.Mock).mockResolvedValue(null);
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const screen = renderRestricted();

    fireEvent.press(screen.getByLabelText('Escanear código de barras'));
    await act(async () => fireEvent.press(screen.getByText('Simular escaneo')));

    expect(findActiveProductByBarcode).toHaveBeenCalledWith('770123', soloAndes);
    expect(alert).toHaveBeenCalledWith(
      'Producto no encontrado',
      expect.stringContaining('tus bodegas de venta'),
      expect.any(Array)
    );
  });
});
