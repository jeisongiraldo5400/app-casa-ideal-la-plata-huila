import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { VoidPagoSheet } from '../VoidPagoSheet';

jest.mock('@expo/vector-icons', () => {
  const ReactModule = jest.requireActual<typeof import('react')>('react');
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    MaterialIcons: ({ name }: { name: string }) => ReactModule.createElement(Text, null, name),
  };
});

const pago = {
  id: 'p1',
  amount: 900000,
  paid_at: '2026-09-10T15:00:00.000Z',
  virtual_receipt_number: 'RV-2026-0000002',
  payment_kind: 'pronto_pago',
  discount_amount: 100000,
};

describe('VoidPagoSheet', () => {
  it('exige el motivo antes de confirmar', () => {
    const onConfirm = jest.fn();
    const { getByLabelText, getByText } = render(
      <VoidPagoSheet pago={pago} onClose={jest.fn()} saving={false} onConfirm={onConfirm} />
    );

    fireEvent.press(getByLabelText('Confirmar anulación del pago'));
    expect(getByText('El motivo de anulación es obligatorio')).toBeTruthy();

    fireEvent.changeText(getByLabelText('Motivo de la anulación'), 'dup');
    fireEvent.press(getByLabelText('Confirmar anulación del pago'));
    expect(onConfirm).not.toHaveBeenCalled();

    fireEvent.changeText(getByLabelText('Motivo de la anulación'), '  Pronto pago registrado por error  ');
    fireEvent.press(getByLabelText('Confirmar anulación del pago'));
    expect(onConfirm).toHaveBeenCalledWith('Pronto pago registrado por error');
  });

  it('explica que el pronto pago reabre el crédito y muestra el error del servidor', () => {
    const { getByText, getByRole } = render(
      <VoidPagoSheet
        pago={pago}
        onClose={jest.fn()}
        saving={false}
        errorText="Sin permiso para anular pagos de este negocio"
        onConfirm={jest.fn()}
      />
    );
    expect(getByRole('header', { name: 'Anular pronto pago' })).toBeTruthy();
    expect(getByText(/el negocio se reabre/)).toBeTruthy();
    expect(getByText('Sin permiso para anular pagos de este negocio')).toBeTruthy();
  });

  it('sin pago seleccionado no se muestra', () => {
    const { queryByText } = render(
      <VoidPagoSheet pago={null} onClose={jest.fn()} saving={false} onConfirm={jest.fn()} />
    );
    expect(queryByText('Anular pago')).toBeNull();
    expect(queryByText('Motivo de la anulación *')).toBeNull();
  });
});
