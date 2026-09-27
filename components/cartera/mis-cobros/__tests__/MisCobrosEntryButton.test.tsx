import { fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';
import { MisCobrosEntryButton } from '../MisCobrosEntryButton';

const mockPush = jest.fn();
jest.mock('expo-router', () => {
  const { useEffect } = require('react');
  return { useRouter: () => ({ push: mockPush }), useFocusEffect: (effect: () => void) => useEffect(effect, [effect]) };
});
jest.mock('@/components/auth/infrastructure/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
jest.mock('@/lib/offline/store/syncStore', () => ({ useSyncStore: (pick: (s: { online: boolean }) => unknown) => pick({ online: true }) }));
const mockFetch = jest.fn();
jest.mock('@/lib/cartera/misCobrosService', () => ({ fetchMisCobros: (...args: unknown[]) => mockFetch(...args) }));
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
  beforeEach(() => {
    mockPush.mockReset();
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({ rows: [], summary: { total_collected: 350000, valid_count: 3 } });
  });

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

  it('muestra lo que la persona cobró hoy, también el recaudador', async () => {
    mockRoles = { admin: false, gestor: false, recaudador: true };
    const screen = render(<MisCobrosEntryButton />);
    await waitFor(() => expect(screen.getByTestId('mis-cobros-hoy').props.children).toMatch(/^Hoy: .*350\.000 · 3 cobros$/));
    expect(mockFetch).toHaveBeenCalledWith(
      expect.objectContaining({ collectorId: 'u1', isSelf: true, scope: 'performed', filters: expect.objectContaining({ status: 'vigentes' }) })
    );
  });

  it('si no se pudo consultar, deja el texto de siempre', async () => {
    mockRoles = { admin: false, gestor: true, recaudador: false };
    mockFetch.mockRejectedValue(new Error('sin red'));
    const screen = render(<MisCobrosEntryButton />);
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    expect(screen.getByText('Lo que cobré, por fecha, método y cierre')).toBeTruthy();
  });

  it('quien no cobra no lo ve', () => {
    mockRoles = { admin: false, gestor: false, recaudador: false };
    const screen = render(<MisCobrosEntryButton />);
    expect(screen.queryByLabelText('Cobros')).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
