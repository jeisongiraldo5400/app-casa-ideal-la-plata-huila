import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';
import { getColors } from '@/constants/theme';
import type { CarteraRow } from '@/lib/cartera/carteraService';
import { CarteraCuotaRow, daysOverdue } from '../CarteraCuotaRow';

const colors = getColors(false);

const row: CarteraRow = {
  cuota_id: 'q1',
  negocio_id: 'n1',
  negocio_numero: 20260001,
  customer_name: 'Ana',
  customer_id_number: '111',
  customer_phone: null,
  municipio_id: 'm1',
  municipio_name: 'Rionegro',
  seller_id: 's1',
  seller_name: 'Luis',
  customer_seller_id: 's1',
  customer_seller_name: 'Luis',
  installment_number: 2,
  due_date: '2999-01-01',
  amount: 150,
  paid_amount: 50,
  late_fee_amount: 0,
  saldo: 100,
  status: 'parcial',
  total_count: 1,
};

describe('CarteraCuotaRow', () => {
  it('muestra negocio · cuota, cliente · CC · municipio, vencimiento, personas, saldo «de» y estado', () => {
    const onPress = jest.fn();
    const screen = render(<CarteraCuotaRow row={row} colors={colors} onPress={onPress} />);

    expect(screen.getByText(/20260001 · /)).toBeTruthy();
    expect(screen.getByText('Ana · CC 111 · Rionegro')).toBeTruthy();
    expect(screen.getByText('Vence 2999-01-01')).toBeTruthy();
    expect(screen.getByTestId('cartera-people')).toBeTruthy();
    expect(screen.getByText(/de \$\s?150/)).toBeTruthy();
    expect(screen.getByText('Parcial')).toBeTruthy();

    fireEvent.press(screen.getByText('Ana · CC 111 · Rionegro'));
    expect(onPress).toHaveBeenCalledWith('n1');
  });

  it('una cuota pagada muestra su valor completo, «Pagada» y sin atraso', () => {
    const screen = render(
      <CarteraCuotaRow row={{ ...row, status: 'pagada', saldo: 0, due_date: '2020-01-01' }} colors={colors} onPress={jest.fn()} />
    );
    expect(screen.getByText('Pagada')).toBeTruthy();
    expect(screen.queryByText(/de \$/)).toBeNull();
    expect(screen.queryByText(/días de atraso/)).toBeNull();
  });

  it('una cuota vencida dice los días de atraso', () => {
    expect(daysOverdue('2026-09-01', new Date(2026, 8, 11, 8))).toBe(10);
    expect(daysOverdue('2026-09-20', new Date(2026, 8, 11, 8))).toBe(0);
    const screen = render(<CarteraCuotaRow row={{ ...row, due_date: '2020-01-01', status: 'mora' }} colors={colors} onPress={jest.fn()} />);
    expect(screen.getByText(/Vence 2020-01-01 · \d+ días de atraso/)).toBeTruthy();
    expect(screen.getByText('En mora')).toBeTruthy();
  });
});
