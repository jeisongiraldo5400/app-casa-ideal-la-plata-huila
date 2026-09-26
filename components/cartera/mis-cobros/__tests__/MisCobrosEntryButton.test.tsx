import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';
import { MisCobrosEntryButton } from '../MisCobrosEntryButton';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('@/components/theme', () => ({ useTheme: () => ({ isDark: false }) }));
let mockRoles = { admin: false, gestor: false, recaudador: false };
jest.mock('@/hooks/useUserRoles', () => ({
  useUserRoles: () => ({
    isAdmin: () => mockRoles.admin,
    isGestorCobro: () => mockRoles.gestor,
    isRecaudador: () => mockRoles.recaudador,
  }),
}));

describe('MisCobrosEntryButton', () => {
  beforeEach(() => mockPush.mockReset());

  it.each([
    ['admin', { admin: true, gestor: false, recaudador: false }],
    ['gestor', { admin: false, gestor: true, recaudador: false }],
    ['recaudador', { admin: false, gestor: false, recaudador: true }],
  ])('el %s ve un solo acceso «Cobros» que abre la pantalla unificada', (_role, roles) => {
    mockRoles = roles;
    const screen = render(<MisCobrosEntryButton />);
    fireEvent.press(screen.getByLabelText('Cobros'));
    expect(mockPush).toHaveBeenCalledWith('/mis-cobros');
  });

  it('quien no cobra no lo ve', () => {
    mockRoles = { admin: false, gestor: false, recaudador: false };
    const screen = render(<MisCobrosEntryButton />);
    expect(screen.queryByLabelText('Cobros')).toBeNull();
  });
});
