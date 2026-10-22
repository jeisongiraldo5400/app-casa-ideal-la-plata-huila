import { render } from '@testing-library/react-native';
import React from 'react';
import { CostosOnlyNegocioScreen } from '../CostosOnlyNegocioView';

const mockScreenOptions: { current: Record<string, unknown> | null } = { current: null };
jest.mock('expo-router', () => ({
  Stack: {
    Screen: ({ options }: { options: Record<string, unknown> }) => {
      mockScreenOptions.current = options;
      return null;
    },
  },
  useRouter: () => ({ back: jest.fn(), replace: jest.fn(), canGoBack: () => true }),
}));
jest.mock('@/lib/supabase', () => ({ supabase: { rpc: jest.fn(() => new Promise(() => undefined)) } }));
jest.mock('@/hooks/useNetworkStatus', () => ({ useNetworkStatus: () => true }));
jest.mock('@/components/theme', () => ({ useTheme: () => ({ isDark: false }) }));
jest.mock('@expo/vector-icons', () => {
  const ReactModule = jest.requireActual<typeof import('react')>('react');
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return { MaterialIcons: ({ name }: { name: string }) => ReactModule.createElement(Text, null, name) };
});

describe('CostosOnlyNegocioScreen', () => {
  it('lleva botón de volver: el header del Stack raíz no pinta uno sin headerLeft', () => {
    render(<CostosOnlyNegocioScreen negocioId="n1" />);
    expect(mockScreenOptions.current?.title).toBe('Costo del negocio');
    expect(typeof mockScreenOptions.current?.headerLeft).toBe('function');
  });
});
