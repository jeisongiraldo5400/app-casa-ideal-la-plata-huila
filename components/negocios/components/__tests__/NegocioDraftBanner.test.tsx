import { fireEvent, render } from '@testing-library/react-native';
import { NegocioDraftBanner } from '../NegocioDraftBanner';

// El Icon real carga la fuente de forma asíncrona y hace setState fuera de act(...).
jest.mock('@expo/vector-icons', () => {
  const ReactModule = jest.requireActual<typeof import('react')>('react');
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    MaterialIcons: ({ name }: { name: string }) => ReactModule.createElement(Text, null, name),
  };
});

const colors = {
  text: { primary: '#111827', secondary: '#6b7280' },
  primary: { main: '#1e3a8a', contrastText: '#ffffff' },
  warning: { main: '#b45309' },
  background: { paper: '#ffffff' },
  divider: '#d1d5db',
};

describe('NegocioDraftBanner', () => {
  it('explica qué quedó a medias', () => {
    const screen = render(
      <NegocioDraftBanner summary="para MARGOTH · paso «Productos»" onContinue={jest.fn()} onRestart={jest.fn()} colors={colors} />
    );

    expect(screen.getByText('Tienes un negocio sin terminar')).toBeTruthy();
    expect(screen.getByText('para MARGOTH · paso «Productos»')).toBeTruthy();
  });

  it('«Continuar» y «Empezar de nuevo» hacen cosas distintas', () => {
    const onContinue = jest.fn();
    const onRestart = jest.fn();
    const screen = render(
      <NegocioDraftBanner summary="x" onContinue={onContinue} onRestart={onRestart} colors={colors} />
    );

    fireEvent.press(screen.getByText('Continuar'));
    expect(onContinue).toHaveBeenCalledTimes(1);
    expect(onRestart).not.toHaveBeenCalled();

    fireEvent.press(screen.getByText('Empezar de nuevo'));
    expect(onRestart).toHaveBeenCalledTimes(1);
  });
});
