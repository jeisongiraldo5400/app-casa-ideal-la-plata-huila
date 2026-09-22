import { fireEvent, render } from '@testing-library/react-native';
import { NegocioOriginOrderPicker } from '../NegocioOriginOrderPicker';
import type { DeliveryOrderOption } from '../../infrastructure/services/negociosDeliveryOrdersService';

// El Icon real carga la fuente de forma asíncrona y hace setState fuera de act(...).
jest.mock('@expo/vector-icons', () => {
  const ReactModule = jest.requireActual<typeof import('react')>('react');
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    MaterialIcons: ({ name }: { name: string }) => ReactModule.createElement(Text, null, name),
  };
});

jest.mock('@/components/theme', () => ({ useTheme: () => ({ isDark: false }) }));

const colors = {
  text: { primary: '#111827', secondary: '#6b7280' },
  primary: { main: '#1e3a8a' },
  background: { paper: '#ffffff' },
  divider: '#d1d5db',
  error: { main: '#dc2626' },
};

const order = (id: string, customerName: string): DeliveryOrderOption => ({
  id,
  order_number: `OE-2026-${id}`,
  created_at: '2026-09-01T00:00:00Z',
  order_type: 'customer',
  status: 'pending',
  customer_id: `c-${id}`,
  customer_name: customerName,
  customer_id_number: '123',
  assigned_user_name: null,
  municipio_id: 'la-plata',
  vereda_id: null,
  delivery_address: 'Calle 5',
  items: [{ product_id: 'p1', product_name: 'Base', warehouse_id: 'w1', warehouse_name: 'Principal', quantity: 1, available_quantity: 1 }],
});

const baseProps = {
  query: '',
  onQueryChange: jest.fn(),
  orders: [order('3408', 'MARGOTH ORTEGA'), order('3409', 'ANA ELISA SANCHEZ')],
  loading: false,
  error: null,
  selectedOrder: null,
  onSelect: jest.fn(),
  onClearSelection: jest.fn(),
  colors,
};

describe('NegocioOriginOrderPicker', () => {
  beforeEach(() => jest.clearAllMocks());

  it('ofrece un buscador y pasa lo escrito', () => {
    const screen = render(<NegocioOriginOrderPicker {...baseProps} />);

    fireEvent.changeText(screen.getByPlaceholderText('Buscar por número, cliente, documento o asesor'), '3408');

    expect(baseProps.onQueryChange).toHaveBeenCalledWith('3408');
  });

  it('sin término avisa que muestra las más recientes', () => {
    const screen = render(<NegocioOriginOrderPicker {...baseProps} />);

    expect(screen.getByText(/más recientes\. Escribe para buscar cualquier otra/)).toBeTruthy();
    expect(screen.getByText('#OE-2026-3408 · Cliente · MARGOTH ORTEGA')).toBeTruthy();
  });

  it('entrega la orden elegida', () => {
    const screen = render(<NegocioOriginOrderPicker {...baseProps} />);

    fireEvent.press(screen.getByTestId('origin-order-3409'));

    expect(baseProps.onSelect).toHaveBeenCalledWith(baseProps.orders[1]);
  });

  // Antes la lista seguía abierta al elegir y lo que faltaba por completar
  // quedaba cientos de tarjetas más abajo: parecía que «Siguiente» no respondía.
  it('con una orden elegida se pliega a esa sola tarjeta', () => {
    const screen = render(<NegocioOriginOrderPicker {...baseProps} selectedOrder={baseProps.orders[0]} />);

    expect(screen.getByTestId('origin-order-selected')).toBeTruthy();
    expect(screen.queryByTestId('origin-order-3409')).toBeNull();
    expect(screen.queryByPlaceholderText('Buscar por número, cliente, documento o asesor')).toBeNull();
  });

  it('«Cambiar» permite volver a elegir', () => {
    const screen = render(<NegocioOriginOrderPicker {...baseProps} selectedOrder={baseProps.orders[0]} />);

    fireEvent.press(screen.getByLabelText('Cambiar orden de entrega'));

    expect(baseProps.onClearSelection).toHaveBeenCalled();
  });

  it('distingue «no hay coincidencias» de «no hay órdenes»', () => {
    const conTermino = render(<NegocioOriginOrderPicker {...baseProps} orders={[]} query="xyz" />);
    expect(conTermino.getByText('Ninguna orden con productos disponibles coincide con la búsqueda.')).toBeTruthy();

    const sinTermino = render(<NegocioOriginOrderPicker {...baseProps} orders={[]} />);
    expect(sinTermino.getByText('No hay órdenes con productos disponibles.')).toBeTruthy();
  });

  it('muestra el error de la búsqueda en vez de una lista vacía', () => {
    const screen = render(<NegocioOriginOrderPicker {...baseProps} orders={[]} error="Sin conexión" />);

    expect(screen.getByText('Sin conexión')).toBeTruthy();
  });
});
