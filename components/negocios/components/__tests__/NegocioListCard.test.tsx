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
});
