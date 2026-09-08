import React from 'react';
import { Pressable, Text } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useSignatureLandscape } from '../useSignatureLandscape';

jest.mock('expo-screen-orientation', () => ({
  OrientationLock: { LANDSCAPE: 'LANDSCAPE', PORTRAIT_UP: 'PORTRAIT_UP' },
  lockAsync: jest.fn().mockResolvedValue(undefined),
}));

function Harness() {
  const { openLandscape, restorePortrait } = useSignatureLandscape();
  return (
    <>
      <Pressable onPress={() => void openLandscape()}><Text>Abrir</Text></Pressable>
      <Pressable onPress={() => void restorePortrait()}><Text>Cerrar</Text></Pressable>
    </>
  );
}

describe('useSignatureLandscape', () => {
  const lockAsync = ScreenOrientation.lockAsync as jest.Mock;

  beforeEach(() => lockAsync.mockClear());

  it('bloquea paisaje y restaura vertical al cerrar', async () => {
    const screen = render(<Harness />);
    await act(async () => fireEvent.press(screen.getByText('Abrir')));
    expect(lockAsync).toHaveBeenCalledWith('LANDSCAPE');

    await act(async () => fireEvent.press(screen.getByText('Cerrar')));
    expect(lockAsync).toHaveBeenLastCalledWith('PORTRAIT_UP');
  });

  it('restaura vertical al desmontarse', async () => {
    const screen = render(<Harness />);
    await act(async () => fireEvent.press(screen.getByText('Abrir')));
    await act(async () => screen.unmount());
    expect(lockAsync).toHaveBeenLastCalledWith('PORTRAIT_UP');
  });
});
