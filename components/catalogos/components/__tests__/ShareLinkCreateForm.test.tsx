import { act, fireEvent, render } from '@testing-library/react-native';
import React from 'react';
import { ShareLinkCreateForm } from '../ShareLinkCreateForm';

jest.mock('@/components/theme', () => ({ useTheme: () => ({ isDark: false }) }));
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) };
});
jest.mock('../../utils/shareLinkPreferences', () => ({
  loadShareLinkHours: jest.fn(async () => 168),
  saveShareLinkHours: jest.fn(async () => undefined),
}));

describe('ShareLinkCreateForm', () => {
  it('un doble toque en «Generar» crea un solo enlace', async () => {
    let finish: (ok: boolean) => void = () => undefined;
    const onCreate = jest.fn(() => new Promise<boolean>((resolve) => (finish = resolve)));
    const screen = render(
      <ShareLinkCreateForm disabled={false} creating={false} progress={null} errors={{}} submitError={null} onCreate={onCreate} />
    );

    // `creating` sigue en false: la prop llegaría un render tarde.
    fireEvent.press(screen.getByText('Generar y enviar por WhatsApp'));
    fireEvent.press(screen.getByText('Generar y enviar por WhatsApp'));
    fireEvent.press(screen.getByText('Solo generar'));
    expect(onCreate).toHaveBeenCalledTimes(1);

    await act(async () => finish(true));
    fireEvent.press(screen.getByText('Solo generar'));
    expect(onCreate).toHaveBeenCalledTimes(2);
    expect(onCreate).toHaveBeenLastCalledWith(expect.objectContaining({ delivery: 'none' }));
  });
});
