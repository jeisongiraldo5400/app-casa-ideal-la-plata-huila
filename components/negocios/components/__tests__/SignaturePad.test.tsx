import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { SignaturePad } from '../SignaturePad';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

describe('SignaturePad', () => {
  it('abre el lienzo de firma sin cambiar la orientación nativa', () => {
    const screen = render(
      <SignaturePad label="Firma del cliente" onChange={jest.fn()} />
    );

    fireEvent.press(screen.getByText('Firmar'));

    expect(screen.getByText('Firme aquí')).toBeTruthy();
    expect(screen.getByText('Confirmar firma')).toBeTruthy();
  });

  it('cierra el lienzo al cancelar', () => {
    const screen = render(
      <SignaturePad label="Firma del cliente" onChange={jest.fn()} />
    );

    fireEvent.press(screen.getByText('Firmar'));
    fireEvent.press(screen.getByText('Cancelar'));

    expect(screen.queryByText('Firme aquí')).toBeNull();
  });
});
