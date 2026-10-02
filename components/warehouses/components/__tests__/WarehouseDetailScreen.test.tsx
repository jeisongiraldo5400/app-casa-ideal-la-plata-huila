import { act, fireEvent, render } from '@testing-library/react-native';
import React from 'react';

import { WarehouseDetailScreen } from '../WarehouseDetailScreen';
import {
  fetchWarehouseHistory,
  fetchWarehouseStock,
  fetchWarehouseTransfers,
} from '../../infrastructure/services/warehousesService';
import { parseWarehouseHistoryPage, parseWarehouseStockPage } from '../../utils/warehouseModel';
import { rawHistoryRow, rawStockRow } from '../../__fixtures__/warehouseFixtures';
import { parseTransferListPage } from '@/components/transfers/utils/transferModel';
import { rawOrder } from '@/components/transfers/__fixtures__/transferFixtures';

jest.mock('@/components/theme', () => ({ useTheme: () => ({ isDark: false }) }));
jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return { MaterialIcons: ({ name }: { name: string }) => <Text>{name}</Text> };
});
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ back: jest.fn(), navigate: jest.fn(), canGoBack: () => true }),
}));
const mockNavigate = jest.fn();
jest.mock('@/hooks/useNavigateWithLoading', () => ({ useNavigateWithLoading: () => mockNavigate }));
jest.mock('@react-navigation/native', () => ({ useIsFocused: () => true }));
jest.mock('@/hooks/useNetworkStatus', () => ({ useNetworkStatus: () => true }));

jest.mock('../../infrastructure/services/warehousesService', () => {
  const actual = jest.requireActual('../../infrastructure/services/warehousesService');
  return {
    ...actual,
    fetchWarehouseStock: jest.fn(),
    fetchWarehouseHistory: jest.fn(),
    fetchWarehouseTransfers: jest.fn(),
  };
});

describe('WarehouseDetailScreen', () => {
  beforeEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('Productos: cantidad y «en camino»; busca con espera', async () => {
    (fetchWarehouseStock as jest.Mock).mockResolvedValue(
      parseWarehouseStockPage({
        total_count: 2,
        rows: [rawStockRow(), rawStockRow({ product_id: 'p-2', name: 'Nevera', incoming: 0, quantity: 1 })],
      })
    );
    const screen = render(<WarehouseDetailScreen warehouseId="w-1" warehouseName="La Argentina" />);
    expect(await screen.findByText('Lavadora LG')).toBeTruthy();
    expect(screen.getByText('+2 en camino')).toBeTruthy();
    expect(screen.getByText('Nevera')).toBeTruthy();
    expect(screen.getAllByText(/en camino$/)).toHaveLength(1);
    expect(fetchWarehouseStock).toHaveBeenCalledWith({ warehouseId: 'w-1', search: '', page: 1 });

    jest.useFakeTimers();
    fireEvent.changeText(screen.getByPlaceholderText('Nombre, SKU o código de barras'), 'nevéra');
    await act(async () => {
      jest.advanceTimersByTime(450);
    });
    jest.useRealTimers();
    expect(fetchWarehouseStock).toHaveBeenLastCalledWith({ warehouseId: 'w-1', search: 'nevéra', page: 1 });
  });

  it('sin permiso: muestra el mensaje del servidor', async () => {
    (fetchWarehouseStock as jest.Mock).mockRejectedValue({ code: '42501', message: 'Sin permiso para ver esta bodega' });
    const screen = render(<WarehouseDetailScreen warehouseId="w-9" warehouseName="Otra" />);
    expect(await screen.findByText('Sin permiso para ver esta bodega')).toBeTruthy();
  });

  it('En camino: llegan y por sacar; tocar uno abre el traslado', async () => {
    (fetchWarehouseStock as jest.Mock).mockResolvedValue(parseWarehouseStockPage({ total_count: 0, rows: [] }));
    (fetchWarehouseTransfers as jest.Mock).mockResolvedValue({
      incoming: parseTransferListPage({ total_count: 1, rows: [rawOrder({ id: 'in-1', order_number: 'TR-2026-0005' })] }),
      pendingDispatch: parseTransferListPage({
        total_count: 1,
        rows: [rawOrder({ id: 'pd-1', order_number: 'TR-2026-0006', status: 'pending_dispatch', due_at: null })],
      }),
    });
    const screen = render(<WarehouseDetailScreen warehouseId="w-1" warehouseName="La Argentina" />);
    await screen.findByText('Sin productos');
    fireEvent.press(screen.getByText('En camino'));

    expect(await screen.findByText('Llegan a esta bodega (1)')).toBeTruthy();
    expect(screen.getByText('Por sacar desde aquí (1)')).toBeTruthy();
    expect(fetchWarehouseTransfers).toHaveBeenCalledWith('w-1');
    fireEvent.press(screen.getByLabelText(/Traslado TR-2026-0006/));
    expect(mockNavigate).toHaveBeenCalledWith('/traslado/pd-1');
  });

  it('Historial: fecha, tipo en español, producto, cantidad con signo, documento y usuario; filtra por tipo', async () => {
    (fetchWarehouseHistory as jest.Mock).mockResolvedValue(
      parseWarehouseHistoryPage({ total_count: 1, rows: [rawHistoryRow()] })
    );
    const screen = render(
      <WarehouseDetailScreen warehouseId="w-1" warehouseName="La Argentina" initialTab="historial" />
    );
    expect(await screen.findByText('Salida')).toBeTruthy();
    expect(screen.getByText('Lavadora LG (LAV-01)')).toBeTruthy();
    expect(screen.getByText('−2')).toBeTruthy();
    expect(screen.getByText('Orden de entrega OE-2026-0042 · Por Ana Bodega')).toBeTruthy();
    expect(screen.getByText('30/09/2026 10:30 a. m.')).toBeTruthy();
    expect(fetchWarehouseHistory).toHaveBeenLastCalledWith({
      warehouseId: 'w-1',
      movementTypes: null,
      dateFrom: null,
      dateTo: null,
      page: 1,
    });

    fireEvent.press(screen.getByText('Entradas'));
    await act(async () => undefined);
    expect(fetchWarehouseHistory).toHaveBeenLastCalledWith(
      expect.objectContaining({ movementTypes: ['entry'], page: 1 })
    );

    fireEvent.press(screen.getByText('Hoy'));
    await act(async () => undefined);
    const last = (fetchWarehouseHistory as jest.Mock).mock.calls.at(-1)[0];
    expect(last.dateFrom).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(last.dateFrom).toBe(last.dateTo);
  });
});
