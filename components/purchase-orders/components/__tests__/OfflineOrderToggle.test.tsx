import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { OfflineOrderToggle, canCarryOrdersOnPhone, canTakeOrderOffline } from '../OfflineOrderToggle';
import { resetLocalOfflineOrdersCache } from '../../infrastructure/hooks/useLocalOfflineOrders';
import { listLocalOfflineOrders } from '@/lib/offline/repositories/deliveryOrdersRepository';
import { useSyncStore } from '@/lib/offline/store/syncStore';

jest.mock('@expo/vector-icons', () => {
  const ReactModule = jest.requireActual<typeof import('react')>('react');
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    MaterialIcons: ({ name }: { name: string }) => ReactModule.createElement(Text, null, name),
  };
});

jest.mock('@/components/theme', () => ({ useTheme: () => ({ isDark: false }) }));

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

jest.mock('@/lib/offline/sync/downloadData', () => ({
  formatLastDownloadTime: (value: number | null) => (value ? '7:15 a. m.' : null),
}));

jest.mock('@/lib/offline/repositories/deliveryOrdersRepository', () => ({
  listLocalOfflineOrders: jest.fn(async () => []),
}));

const mockSelection = {
  isSelected: jest.fn((_id: string) => false),
  toggle: jest.fn(async (_id: string) => true),
  count: 0,
  mode: 'seleccion' as const,
  supported: true,
};
jest.mock('@/components/offline/infrastructure/syncPrefsService', () => ({
  useOfflineSelection: () => mockSelection,
}));

const localOrder = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  orderNumber: 'REM-0010',
  orderType: 'remission',
  status: 'approved',
  customerId: null,
  customerName: null,
  municipioId: null,
  veredaId: null,
  deliveryAddress: null,
  usable: true,
  unusableReason: null,
  snapshotAt: 1_000,
  ...overrides,
});

/** Deja terminar la lectura de la foto local antes de mirar. */
const settle = () => act(async () => {});

describe('OfflineOrderToggle · Llevar en el teléfono', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetLocalOfflineOrdersCache();
    mockSelection.supported = true;
    mockSelection.isSelected.mockReturnValue(false);
    useSyncStore.setState({ online: true, lastSyncedAt: 1 });
  });

  it('una orden sin marcar ofrece llevarla y la marca al pulsar', async () => {
    const screen = render(<OfflineOrderToggle orderId="rem-1" orderNumber="REM-0010" />);
    await settle();

    expect(screen.queryByText('En el teléfono')).toBeNull();
    fireEvent.press(screen.getByText('Llevar en el teléfono'));

    await waitFor(() => expect(mockSelection.toggle).toHaveBeenCalledWith('rem-1'));
  });

  it('marcar no descarga: dice que falta pulsar Descargar y lleva a Preparar el teléfono', async () => {
    mockSelection.isSelected.mockReturnValue(true);
    const screen = render(<OfflineOrderToggle orderId="rem-1" />);
    await settle();

    expect(screen.getByText('En el teléfono')).toBeTruthy();
    fireEvent.press(
      screen.getByText('Pendiente de descargar · pulsa Descargar en Preparar el teléfono')
    );
    expect(mockPush).toHaveBeenCalledWith('/datos-sin-conexion');
    fireEvent.press(screen.getByText('Quitar del teléfono'));
    await waitFor(() => expect(mockSelection.toggle).toHaveBeenCalledWith('rem-1'));
  });

  it('marcada y ya descargada dice la hora de la foto', async () => {
    mockSelection.isSelected.mockReturnValue(true);
    (listLocalOfflineOrders as jest.Mock).mockResolvedValue([localOrder('rem-1')]);

    const screen = render(<OfflineOrderToggle orderId="rem-1" />);
    await settle();

    await waitFor(() => expect(screen.getByText('Descargada 7:15 a. m.')).toBeTruthy());
    expect(screen.queryByText(/Pendiente de descargar/)).toBeNull();
  });

  it('si la foto dice que ya no sirve, muestra el motivo', async () => {
    mockSelection.isSelected.mockReturnValue(true);
    (listLocalOfflineOrders as jest.Mock).mockResolvedValue([
      localOrder('rem-1', { usable: false, unusableReason: 'La remisión fue cancelada' }),
    ]);

    const screen = render(<OfflineOrderToggle orderId="rem-1" />);
    await settle();

    await waitFor(() => expect(screen.getByText('La remisión fue cancelada')).toBeTruthy());
  });

  it('si no se pudo marcar no muestra otra alerta (ya la muestra useOfflineSelection)', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockSelection.toggle.mockResolvedValueOnce(false);
    const screen = render(<OfflineOrderToggle orderId="rem-1" />);
    await settle();

    fireEvent.press(screen.getByText('Llevar en el teléfono'));

    await waitFor(() => expect(mockSelection.toggle).toHaveBeenCalled());
    await settle();
    expect(alert).not.toHaveBeenCalled();
    expect(screen.getByText('Llevar en el teléfono')).toBeTruthy();
    alert.mockRestore();
  });

  it('sin señal no se puede cambiar (lo decide el servidor)', async () => {
    useSyncStore.setState({ online: false });
    const screen = render(<OfflineOrderToggle orderId="rem-1" />);
    await settle();

    fireEvent.press(screen.getByText('Llevar en el teléfono'));

    expect(mockSelection.toggle).not.toHaveBeenCalled();
  });

  it('con un servidor sin descarga selectiva no aparece', async () => {
    mockSelection.supported = false;
    const screen = render(<OfflineOrderToggle orderId="rem-1" />);
    await settle();

    expect(screen.queryByText('Llevar en el teléfono')).toBeNull();
  });

  it('solo remisiones y OE de cliente vigentes se pueden llevar', () => {
    expect(canTakeOrderOffline({ order_type: 'remission', status: 'approved' })).toBe(true);
    expect(canTakeOrderOffline({ order_type: 'customer', status: 'delivered' })).toBe(true);
    expect(canTakeOrderOffline({ order_type: 'remission', status: 'cancelled' })).toBe(false);
    expect(canTakeOrderOffline({ order_type: 'internal', status: 'pending' })).toBe(false);
  });
});

describe('canCarryOrdersOnPhone', () => {
  it('solo quien crea negocios lleva órdenes (misma regla que orders_allowed)', () => {
    expect(canCarryOrdersOnPhone(['admin'])).toBe(true);
    expect(canCarryOrdersOnPhone(['vendedor'])).toBe(true);
    expect(canCarryOrdersOnPhone(['Gestor de cobro'])).toBe(true);
    expect(canCarryOrdersOnPhone(['bodeguero'])).toBe(false);
    expect(canCarryOrdersOnPhone(['recaudador'])).toBe(false);
    expect(canCarryOrdersOnPhone([])).toBe(false);
  });
});
