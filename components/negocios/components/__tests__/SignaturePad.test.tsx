import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import * as ScreenOrientation from 'expo-screen-orientation';
import { SignaturePad } from '../SignaturePad';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

jest.mock('expo-screen-orientation', () => ({
  OrientationLock: { LANDSCAPE: 'LANDSCAPE', PORTRAIT_UP: 'PORTRAIT_UP' },
  lockAsync: jest.fn().mockResolvedValue(undefined),
}));

describe('SignaturePad', () => {
  it('abre el lienzo después de bloquear la orientación horizontal', async () => {
    const screen = render(
      <SignaturePad label="Firma del cliente" onChange={jest.fn()} />
    );

    await act(async () => fireEvent.press(screen.getByText('Firmar')));

    await waitFor(() => expect(screen.getByText(/Preparando área de firma|Firme aquí/)).toBeTruthy());
    expect(screen.getByText('Confirmar firma')).toBeTruthy();
    expect(ScreenOrientation.lockAsync).toHaveBeenCalledWith('LANDSCAPE');
  });

  it('cierra el lienzo y restaura vertical al cancelar', async () => {
    const screen = render(
      <SignaturePad label="Firma del cliente" onChange={jest.fn()} />
    );

    await act(async () => fireEvent.press(screen.getByText('Firmar')));
    await waitFor(() => expect(screen.getByText('Cancelar')).toBeTruthy());
    await act(async () => fireEvent.press(screen.getByText('Cancelar')));

    await waitFor(() => expect(screen.queryByText('Firme aquí')).toBeNull());
    expect(ScreenOrientation.lockAsync).toHaveBeenLastCalledWith('PORTRAIT_UP');
  });
});
