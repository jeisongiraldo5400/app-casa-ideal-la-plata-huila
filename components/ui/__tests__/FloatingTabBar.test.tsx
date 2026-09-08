import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';
import { FloatingTabBar } from '../FloatingTabBar';

const mockNavigate = jest.fn();
const mockEmit = jest.fn(() => ({ defaultPrevented: false }));

jest.mock('@/components/theme', () => ({
  useTheme: () => ({ isDark: false }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

jest.mock('@expo/vector-icons', () => {
  const ReactModule = jest.requireActual<typeof import('react')>('react');
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    MaterialIcons: ({ name }: { name: string }) => ReactModule.createElement(Text, null, name),
  };
});

describe('FloatingTabBar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('permanece visible en Cartera y permite navegar a Inicio', () => {
    const routes = [
      { key: 'index-key', name: 'index', params: undefined },
      { key: 'inventory-key', name: 'inventory', params: undefined },
      { key: 'search-key', name: 'search', params: undefined },
      { key: 'exits-key', name: 'exits-list', params: undefined },
      { key: 'profile-key', name: 'profile', params: undefined },
      { key: 'cartera-key', name: 'cartera', params: undefined },
    ];
    const descriptors = Object.fromEntries(
      routes.map((route) => [route.key, { options: {} }]),
    );

    const screen = render(
      <FloatingTabBar
        state={{ index: 5, routes } as never}
        descriptors={descriptors as never}
        navigation={{ emit: mockEmit, navigate: mockNavigate } as never}
        insets={{ top: 0, right: 0, bottom: 0, left: 0 }}
      />,
    );

    const homeTab = screen.getByText('Inicio');
    expect(homeTab).toBeTruthy();

    fireEvent.press(homeTab);
    expect(mockNavigate).toHaveBeenCalledWith('index', undefined);
  });

  it('permanece visible en Negocios y permite navegar a Inicio', () => {
    const routes = [
      { key: 'index-key', name: 'index', params: undefined },
      { key: 'inventory-key', name: 'inventory', params: undefined },
      { key: 'search-key', name: 'search', params: undefined },
      { key: 'exits-key', name: 'exits-list', params: undefined },
      { key: 'profile-key', name: 'profile', params: undefined },
      { key: 'negocios-key', name: 'negocios', params: undefined },
    ];
    const descriptors = Object.fromEntries(
      routes.map((route) => [route.key, { options: {} }]),
    );

    const screen = render(
      <FloatingTabBar
        state={{ index: 5, routes } as never}
        descriptors={descriptors as never}
        navigation={{ emit: mockEmit, navigate: mockNavigate } as never}
        insets={{ top: 0, right: 0, bottom: 0, left: 0 }}
      />,
    );

    fireEvent.press(screen.getByText('Inicio'));
    expect(mockNavigate).toHaveBeenCalledWith('index', undefined);
  });
});
