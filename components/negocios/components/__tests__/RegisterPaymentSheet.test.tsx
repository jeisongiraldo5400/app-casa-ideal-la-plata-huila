import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { RegisterPaymentSheet } from '../RegisterPaymentSheet';

function renderSheet(overrides: Partial<React.ComponentProps<typeof RegisterPaymentSheet>> = {}) {
  const props = {
    visible: true,
    onClose: jest.fn(),
    subtitle: 'NEG-001 · Cliente',
    pendingBalance: 100_000,
    amount: '',
    onChangeAmount: jest.fn(),
    receipt: '',
    onChangeReceipt: jest.fn(),
    supportFile: null,
    onPickSupport: jest.fn(),
    onRemoveSupport: jest.fn(),
    saving: false,
    onSubmit: jest.fn(),
    ...overrides,
  };
  return { ...render(<RegisterPaymentSheet {...props} />), props };
}

describe('RegisterPaymentSheet', () => {
  it('muestra las opciones de soporte dentro de la hoja y permite cancelarlas', () => {
    const { getByText, getByLabelText, queryByText, props } = renderSheet();

    fireEvent.press(getByText('Adjuntar soporte (opcional)'));
    expect(getByText('Tomar foto')).toBeTruthy();
    expect(getByText('Galería')).toBeTruthy();
    expect(getByText('Archivo / PDF')).toBeTruthy();
    expect(queryByText('Quitar soporte')).toBeNull();

    fireEvent.press(getByLabelText('Cancelar selección de soporte'));
    expect(queryByText('Tomar foto')).toBeNull();
    expect(getByText('Adjuntar soporte (opcional)')).toBeTruthy();
    expect(props.onPickSupport).not.toHaveBeenCalled();
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it('notifica el origen elegido y vuelve al estado inicial', () => {
    const { getByText, queryByText, props } = renderSheet();

    fireEvent.press(getByText('Adjuntar soporte (opcional)'));
    fireEvent.press(getByText('Galería'));

    expect(props.onPickSupport).toHaveBeenCalledWith('gallery');
    expect(queryByText('Tomar foto')).toBeNull();
  });

  it('permite quitar un soporte ya adjunto', () => {
    const { getByText, props } = renderSheet({
      supportFile: { uri: 'file:///tmp/soporte.jpg', mimeType: 'image/jpeg', name: 'soporte.jpg' },
    });

    fireEvent.press(getByText('soporte.jpg'));
    fireEvent.press(getByText('Quitar soporte'));

    expect(props.onRemoveSupport).toHaveBeenCalledTimes(1);
    expect(props.onPickSupport).not.toHaveBeenCalled();
  });
});
