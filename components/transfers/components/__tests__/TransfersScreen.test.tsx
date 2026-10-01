import { act, fireEvent, render } from '@testing-library/react-native';
import React from 'react';

import { TransfersScreen } from '../TransfersScreen';
import {
  fetchMyTransferTasks,
  fetchMyWarehouseMemberships,
  fetchTransferOrdersPage,
} from '../../infrastructure/services/transfersService';
import { parseTransferListPage, parseTransferTasks } from '../../utils/transferModel';
import { rawOrder } from '../../__fixtures__/transferFixtures';

jest.mock('@/components/theme', () => ({ useTheme: () => ({ isDark: false }) }));
jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return { MaterialIcons: ({ name }: { name: string }) => <Text>{name}</Text> };
});
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ back: jest.fn(), navigate: jest.fn(), canGoBack: () => true }),
}));
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) };
});
const mockNavigate = jest.fn();
jest.mock('@/hooks/useNavigateWithLoading', () => ({ useNavigateWithLoading: () => mockNavigate }));
jest.mock('@react-navigation/native', () => ({ useIsFocused: () => true }));
jest.mock('@/hooks/useNetworkStatus', () => ({ useNetworkStatus: () => true }));

let mockRoleNames: string[] = [];
jest.mock('@/hooks/useUserRoles', () => ({
  useUserRoles: () => ({ roles: mockRoleNames.map((nombre) => ({ role: { nombre } })), loading: false }),
}));

jest.mock('../../infrastructure/services/transfersService', () => ({
  fetchMyTransferTasks: jest.fn(),
  fetchMyWarehouseMemberships: jest.fn(async () => []),
  fetchTransferOrdersPage: jest.fn(),
  isTransfersUnavailableError: (error: { code?: string }) => error?.code === 'PGRST202',
}));

const tasks = () =>
  parseTransferTasks({
    to_dispatch: [rawOrder({ id: 'd-1', order_number: 'TR-2026-0010', status: 'pending_dispatch', due_at: null })],
    to_receive: [
      rawOrder({ id: 'r-1', order_number: 'TR-2026-0002' }),
      rawOrder({ id: 'r-2', order_number: 'TR-2026-0003', is_overdue: true }),
    ],
    carrying: [],
    to_confirm_return: [],
  });

describe('TransfersScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRoleNames = [];
  });

  it('abre «Por recibir» con vencidos arriba y en rojo; contadores por pestaña', async () => {
    (fetchMyTransferTasks as jest.Mock).mockResolvedValue(tasks());
    const screen = render(<TransfersScreen />);

    expect(await screen.findByText('Por recibir')).toBeTruthy();
    expect(screen.getByText('1 vencido')).toBeTruthy();
    expect(screen.getAllByText('Vencido')).toHaveLength(1);
    const numbers = screen.getAllByText(/^TR-2026-000[23]$/).map((node) => node.props.children);
    expect(numbers).toEqual(['TR-2026-0003', 'TR-2026-0002']);
    // Badges: despachar 1, recibir 2, transporto 0, devolución 0
    expect(screen.getByText('2')).toBeTruthy();

    fireEvent.press(screen.getByLabelText(/Traslado TR-2026-0003/));
    expect(mockNavigate).toHaveBeenCalledWith('/traslado/r-2?modo=recibir');
  });

  it('cambia a «Por despachar» y abre el detalle en modo despachar', async () => {
    (fetchMyTransferTasks as jest.Mock).mockResolvedValue(tasks());
    const screen = render(<TransfersScreen />);
    await screen.findByText('Por recibir');
    fireEvent.press(screen.getByText('Despachar'));
    fireEvent.press(screen.getByLabelText(/Traslado TR-2026-0010/));
    expect(mockNavigate).toHaveBeenCalledWith('/traslado/d-1?modo=despachar');
  });

  it('muestra las cuatro secciones con nombre completo y qué se hace en cada una', async () => {
    (fetchMyTransferTasks as jest.Mock).mockResolvedValue(tasks());
    const screen = render(<TransfersScreen />);
    await screen.findByText('Por recibir');
    for (const [label, hint] of [
      ['Despachar', 'Sacar de la bodega'],
      ['Recibir', 'Confirmar lo que llegó'],
      ['Transporto', 'Los llevo yo'],
      ['Devoluciones', 'Vuelven al origen'],
    ]) {
      expect(screen.getByText(label)).toBeTruthy();
      expect(screen.getByText(hint)).toBeTruthy();
    }
    expect(screen.getByLabelText('Recibir: Confirmar lo que llegó. 2 pendientes')).toBeTruthy();
  });

  it('«Historial» lista todos los traslados como la web, con quién recibió, y filtra por estado', async () => {
    (fetchMyTransferTasks as jest.Mock).mockResolvedValue(tasks());
    (fetchTransferOrdersPage as jest.Mock).mockResolvedValue(
      parseTransferListPage({
        total_count: 1,
        rows: [
          rawOrder({
            id: 'h-1',
            order_number: 'TR-2026-0001',
            status: 'received',
            received_at: '2026-09-29T23:33:00Z',
            received_by_names: ['Luis Bodega'],
          }),
        ],
      })
    );
    const screen = render(<TransfersScreen />);
    await screen.findByText('Por recibir');
    fireEvent.press(screen.getByText('Historial'));

    expect(await screen.findByText('TR-2026-0001')).toBeTruthy();
    expect(screen.getByText(/Luis Bodega/)).toBeTruthy();
    expect(fetchTransferOrdersPage).toHaveBeenLastCalledWith({ statuses: null, search: '', page: 1, pageSize: 20 });

    fireEvent.press(screen.getByText('Recibidos'));
    await act(async () => undefined);
    expect(fetchTransferOrdersPage).toHaveBeenLastCalledWith(
      expect.objectContaining({ statuses: ['received'], page: 1 })
    );

    fireEvent.press(screen.getByLabelText(/Traslado TR-2026-0001/));
    expect(mockNavigate).toHaveBeenCalledWith('/traslado/h-1');
  });

  it('sin tareas ni bodega ni rol: explica cómo obtener acceso', async () => {
    (fetchMyTransferTasks as jest.Mock).mockResolvedValue(parseTransferTasks({}));
    const screen = render(<TransfersScreen />);
    expect(await screen.findByText('Sin traslados asignados')).toBeTruthy();
    expect(fetchMyWarehouseMemberships).toHaveBeenCalled();
  });

  it('servidor sin las RPC: aviso claro', async () => {
    (fetchMyTransferTasks as jest.Mock).mockRejectedValue({ code: 'PGRST202', message: 'Could not find the function' });
    const screen = render(<TransfersScreen />);
    expect(await screen.findByText('Traslados aún no disponible')).toBeTruthy();
  });
});
