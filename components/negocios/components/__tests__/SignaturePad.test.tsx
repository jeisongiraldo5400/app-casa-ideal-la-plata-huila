import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { SignaturePad } from '../SignaturePad';
import * as ScreenOrientation from 'expo-screen-orientation';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

jest.mock('expo-screen-orientation', () => ({
  OrientationLock: {
    LANDSCAPE: 'LANDSCAPE',
    PORTRAIT_UP: 'PORTRAIT_UP',
  },
  lockAsync: jest.fn().mockResolvedValue(undefined),
}));

describe('SignaturePad orientation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('bloquea horizontal al abrir y restaura vertical al cancelar', async () => {
    const screen = render(
      <SignaturePad label="Firma del cliente" onChange={jest.fn()} />
    );

    fireEvent.press(screen.getByText('Firmar'));

    await waitFor(() => {
      expect(ScreenOrientation.lockAsync).toHaveBeenCalledWith(
        ScreenOrientation.OrientationLock.LANDSCAPE
      );
    });

    fireEvent.press(screen.getByText('Cancelar'));

    await waitFor(() => {
      expect(ScreenOrientation.lockAsync).toHaveBeenCalledWith(
        ScreenOrientation.OrientationLock.PORTRAIT_UP
      );
    });
  });

  it('restaura vertical si el componente se desmonta con la firma abierta', async () => {
    const screen = render(
      <SignaturePad label="Firma del cliente" onChange={jest.fn()} />
    );

    fireEvent.press(screen.getByText('Firmar'));
    await waitFor(() => {
      expect(ScreenOrientation.lockAsync).toHaveBeenCalledWith(
        ScreenOrientation.OrientationLock.LANDSCAPE
      );
    });

    screen.unmount();

    await waitFor(() => {
      expect(ScreenOrientation.lockAsync).toHaveBeenCalledWith(
        ScreenOrientation.OrientationLock.PORTRAIT_UP
      );
    });
  });
});
