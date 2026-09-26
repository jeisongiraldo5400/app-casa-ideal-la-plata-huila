import { fireEvent, render } from '@testing-library/react-native';
import { NegocioListCard } from '../NegocioListCard';

jest.mock('@expo/vector-icons', () => ({ MaterialIcons: 'MaterialIcons' }));
jest.mock('@/components/theme', () => ({ useTheme: () => ({ isDark: false }) }));

const item = {
  id: 'n1',
  numero: 20260007,
  status: 'activo',
  deal_date: '2026-09-20',
  total_credit: 1000000,
  remaining_balance: 800000,
  installments_count: 10,
  has_mora: false,
  customer: { name: 'MARGOTH PÉREZ', id_number: '123' },
};

describe('NegocioListCard', () => {
  it('sin estado de envío no pinta distintivo', () => {
    const screen = render(<NegocioListCard item={item} onPress={jest.fn()} />);
    expect(screen.queryByText('Pendiente de enviar')).toBeNull();
    expect(screen.queryByText('No se pudo enviar')).toBeNull();
    expect(screen.getByText('20260007')).toBeTruthy();
  });

  it('pendiente: distintivo y «Sin número» mientras el servidor no lo asigna', () => {
    const screen = render(
      <NegocioListCard item={{ ...item, numero: 0, status: 'por_firmar' }} syncState="pending" onPress={jest.fn()} />
    );
    expect(screen.getByText('Pendiente de enviar')).toBeTruthy();
    expect(screen.getByText('Sin número')).toBeTruthy();
  });

  it('rechazado: distintivo rojo y la tarjeta sigue siendo pulsable', () => {
    const onPress = jest.fn();
    const screen = render(
      <NegocioListCard item={{ ...item, numero: 0 }} syncState="rejected" onPress={onPress} />
    );
    expect(screen.getByText('No se pudo enviar')).toBeTruthy();
    const card = screen.getByRole('button');
    expect(card.props.accessibilityLabel).toContain('No se pudo enviar');
    expect(card.props.accessibilityHint).toContain('Cambios sin sincronizar');
    fireEvent.press(card);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('con productos: hasta 3 líneas «cantidad × producto» y «+N más»', () => {
    const products = [
      { name: 'Colchón doble', sku: 'C1', quantity: 2 },
      { name: 'Base', sku: null, quantity: 1 },
      { name: 'Almohada', sku: null, quantity: 4 },
      { name: 'Protector', sku: null, quantity: 1 },
      { name: 'Sábanas', sku: null, quantity: 1 },
    ];
    const screen = render(<NegocioListCard item={item} products={products} onPress={jest.fn()} />);
    expect(screen.getByText('2 × Colchón doble')).toBeTruthy();
    expect(screen.getByText('1 × Base')).toBeTruthy();
    expect(screen.getByText('4 × Almohada')).toBeTruthy();
    expect(screen.queryByText('1 × Protector')).toBeNull();
    expect(screen.getByText('+2 más')).toBeTruthy();
    expect(screen.getByRole('button').props.accessibilityLabel).toContain('productos: 2 × Colchón doble');
  });

  it('con 3 o menos no pinta «más»; sin productos no pinta la sección', () => {
    const screen = render(
      <NegocioListCard item={item} products={[{ name: 'Base', sku: null, quantity: 1 }]} onPress={jest.fn()} />
    );
    expect(screen.getByText('1 × Base')).toBeTruthy();
    expect(screen.queryByText(/más$/)).toBeNull();
    screen.rerender(<NegocioListCard item={item} products={[]} onPress={jest.fn()} />);
    expect(screen.queryByTestId('productos-negocio-n1')).toBeNull();
    screen.rerender(<NegocioListCard item={item} onPress={jest.fn()} />);
    expect(screen.queryByTestId('productos-negocio-n1')).toBeNull();
  });
});
