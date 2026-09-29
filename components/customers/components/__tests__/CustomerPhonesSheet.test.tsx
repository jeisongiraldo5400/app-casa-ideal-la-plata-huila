import { fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Alert } from 'react-native';
import { CustomerPhonesSheet } from '../CustomerPhonesSheet';

jest.mock('@/components/theme', () => ({ useTheme: () => ({ isDark: false }) }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

function renderSheet(onSave = jest.fn().mockResolvedValue(undefined)) {
  const onClose = jest.fn();
  const screen = render(
    <CustomerPhonesSheet visible phone="3001112222" phoneSecondary="3105550101" onClose={onClose} onSave={onSave} />
  );
  return { screen, onSave, onClose };
}

describe('CustomerPhonesSheet', () => {
  it('parte de los teléfonos guardados y guarda el cambio recortado', async () => {
    const { screen, onSave, onClose } = renderSheet();
    expect(screen.getByDisplayValue('3105550101')).toBeTruthy();
    fireEvent.changeText(screen.getByPlaceholderText('Otro número de contacto'), ' 320 999 8888 ');
    fireEvent.press(screen.getByText('Guardar'));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ phone: '3001112222', phoneSecondary: '320 999 8888' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('vaciar el teléfono 2 lo borra (null)', async () => {
    const { screen, onSave } = renderSheet();
    fireEvent.changeText(screen.getByPlaceholderText('Otro número de contacto'), '');
    fireEvent.press(screen.getByText('Guardar'));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ phone: '3001112222', phoneSecondary: null }));
  });

  it('si el servidor rechaza, avisa y no cierra', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const { screen, onClose } = renderSheet(jest.fn().mockRejectedValue(new Error('No tienes permiso para editar este cliente.')));
    fireEvent.press(screen.getByText('Guardar'));

    await waitFor(() => expect(alert).toHaveBeenCalledWith('No se pudo guardar', expect.any(String)));
    expect(onClose).not.toHaveBeenCalled();
    alert.mockRestore();
  });
});
