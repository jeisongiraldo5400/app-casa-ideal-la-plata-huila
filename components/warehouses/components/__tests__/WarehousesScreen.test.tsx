import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';

import { WarehousesScreen } from '../WarehousesScreen';
import { fetchMyWarehouses } from '../../infrastructure/services/warehousesService';
import { parseMyWarehouses } from '../../utils/warehouseModel';
import { rawWarehouse } from '../../__fixtures__/warehouseFixtures';

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
let mockOnline = true;
jest.mock('@/hooks/useNetworkStatus', () => ({ useNetworkStatus: () => mockOnline }));

jest.mock('../../infrastructure/services/warehousesService', () => {
  const actual = jest.requireActual('../../infrastructure/services/warehousesService');
  return { ...actual, fetchMyWarehouses: jest.fn() };
});

describe('WarehousesScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockOnline = true;
  });

  it('sin bodegas asignadas: explica a quién pedir acceso', async () => {
    (fetchMyWarehouses as jest.Mock).mockResolvedValue(parseMyWarehouses({ is_admin: false, warehouses: [] }));
    const screen = render(<WarehousesScreen />);
    expect(await screen.findByText('Sin bodegas asignadas')).toBeTruthy();
    expect(
      screen.getByText('No tienes bodegas asignadas. Pide al administrador que te asigne como responsable.')
    ).toBeTruthy();
  });

  it('con datos: nombre, ciudad, existencias, en camino, por despachar y encargados; abre el detalle', async () => {
    (fetchMyWarehouses as jest.Mock).mockResolvedValue(
      parseMyWarehouses({
        is_admin: false,
        warehouses: [
          rawWarehouse(),
          rawWarehouse({
            id: 'w-2',
            name: 'Principal',
            city: null,
            address: null,
            incoming_transfers: 0,
            pending_dispatch: 0,
            managers: [],
            total_products: 1,
            total_units: 1,
          }),
        ],
      })
    );
    const screen = render(<WarehousesScreen />);

    expect(await screen.findByText('La Argentina')).toBeTruthy();
    expect(screen.getByText('Eres responsable de 2 bodegas.')).toBeTruthy();
    expect(screen.getByText('Pitalito · Cra 4 # 5-10')).toBeTruthy();
    expect(screen.getByText('12 productos · 340 unidades')).toBeTruthy();
    expect(screen.getByText('2 en camino')).toBeTruthy();
    expect(screen.getByText('1 por despachar')).toBeTruthy();
    expect(screen.getByText('Encargados: Ana Bodega, Luis Pérez')).toBeTruthy();
    expect(screen.getByText('1 producto · 1 unidad')).toBeTruthy();
    expect(screen.getByText('Sin encargado asignado')).toBeTruthy();
    expect(screen.getAllByText(/en camino$/)).toHaveLength(1);

    fireEvent.press(screen.getByLabelText(/^Bodega La Argentina/));
    expect(mockNavigate).toHaveBeenCalledWith('/bodega/w-1?nombre=La%20Argentina');
  });

  it('el admin ve el aviso de que ve todas', async () => {
    (fetchMyWarehouses as jest.Mock).mockResolvedValue(parseMyWarehouses({ is_admin: true, warehouses: [rawWarehouse()] }));
    const screen = render(<WarehousesScreen />);
    expect(await screen.findByText('Como administrador ves todas las bodegas.')).toBeTruthy();
  });

  it('sin señal y sin datos: aviso como en Traslados, sin consultar', async () => {
    mockOnline = false;
    const screen = render(<WarehousesScreen />);
    expect(await screen.findByText('Sin señal')).toBeTruthy();
    expect(fetchMyWarehouses).not.toHaveBeenCalled();
  });

  it('servidor sin la migración: aviso claro', async () => {
    (fetchMyWarehouses as jest.Mock).mockRejectedValue({ code: 'PGRST202', message: 'Could not find the function' });
    const screen = render(<WarehousesScreen />);
    expect(await screen.findByText('Bodegas aún no disponible')).toBeTruthy();
  });
});
