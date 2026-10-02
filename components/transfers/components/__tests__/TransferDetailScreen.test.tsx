import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';

import { TransferDetailScreen } from '../TransferDetailScreen';
import {
  confirmTransferReturn,
  dispatchTransfer,
  fetchTransferDetail,
  receiveTransfer,
} from '../../infrastructure/services/transfersService';
import { useTransferDraftStore } from '../../infrastructure/store/transferDraftStore';
import { kickNotificationDispatch } from '@/components/notifications/infrastructure/services/dispatchNotifications';
import { parseTransferDetail } from '../../utils/transferModel';
import { rawDetail, rawItem, rawPendingDispatchDetail } from '../../__fixtures__/transferFixtures';

jest.mock('@/components/theme', () => ({ useTheme: () => ({ isDark: false }) }));
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) };
});
jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return { MaterialIcons: ({ name }: { name: string }) => <Text>{name}</Text> };
});
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ back: jest.fn(), canGoBack: () => true, replace: jest.fn() }),
}));

let mockUserId = 'u-recv';
jest.mock('@/components/auth/infrastructure/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: mockUserId } }),
}));

let mockOnline = true;
jest.mock('@/hooks/useNetworkStatus', () => ({ useNetworkStatus: () => mockOnline }));

jest.mock('@/lib/users/sellersService', () => ({
  fetchSellerOptions: jest.fn(async () => [
    { id: 'u-carrier', full_name: 'Darío' },
    { id: 'u-otro', full_name: 'Otro Transportador' },
  ]),
}));

jest.mock('@/lib/idempotency', () => ({
  getOrCreatePersistentIdempotencyKey: jest.fn(async () => 'key-1'),
  clearPersistentIdempotencyKey: jest.fn(async () => undefined),
}));

jest.mock('@/components/notifications/infrastructure/services/dispatchNotifications', () => ({
  kickNotificationDispatch: jest.fn(),
}));

jest.mock('../../infrastructure/services/transfersService', () => ({
  fetchTransferDetail: jest.fn(),
  dispatchTransfer: jest.fn(),
  receiveTransfer: jest.fn(),
  confirmTransferReturn: jest.fn(),
}));

const fetchDetail = fetchTransferDetail as jest.Mock;

function renderWith(raw: unknown, preferred: 'dispatch' | 'receive' | 'return' | null = null) {
  fetchDetail.mockResolvedValue(parseTransferDetail(raw));
  return render(<TransferDetailScreen transferOrderId="t-1" preferredMode={preferred} />);
}

describe('TransferDetailScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockOnline = true;
    mockUserId = 'u-recv';
    useTransferDraftStore.getState().reset();
  });

  it('despachar: ajusta cantidades con −/+ y confirma con resumen', async () => {
    (dispatchTransfer as jest.Mock).mockResolvedValue({
      transferOrderId: 't-1',
      orderNumber: 'TR-2026-0001',
      status: 'in_transit',
      replayed: false,
      quantities: {},
    });
    const screen = renderWith(rawPendingDispatchDetail());

    await screen.findByText('Revisar y despachar');
    fireEvent.press(screen.getByLabelText('Quitar una unidad: A despachar de Nevera Haceb'));
    fireEvent.press(screen.getByText('Revisar y despachar'));

    expect(screen.getByText(/Vas a despachar 4 unidades \(2 productos\) de Principal → La Argentina\./)).toBeTruthy();
    expect(screen.getByText(/1 unidad no sale y vuelve al disponible de Principal\./)).toBeTruthy();
    expect(screen.getByText(/Pueden recibir en La Argentina: Recibe\. Les llegará un aviso\./)).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByText('Confirmar despacho'));
    });

    expect(dispatchTransfer).toHaveBeenCalledWith({
      transferOrderId: 't-1',
      items: [
        { item_id: 'i-1', quantity: 3 },
        { item_id: 'i-2', quantity: 1 },
      ],
      carrierUserId: null,
      notes: '',
      photoPath: null,
      receiverIds: ['u-recv'],
      idempotencyKey: 'key-1',
    });
    expect(await screen.findByText('TR-2026-0001 despachado: 4 unidades en camino a La Argentina.')).toBeTruthy();
    expect(fetchDetail).toHaveBeenCalledTimes(2);
    expect(kickNotificationDispatch).toHaveBeenCalledTimes(1);
  });

  it('por despachar sin receptores no avisa «sin bodegueros»: quién recibe se elige al despachar', async () => {
    const raw = { ...rawPendingDispatchDetail(), receivers: [] };
    const screen = renderWith(raw);
    await screen.findByText('Revisar y despachar');
    expect(screen.queryByText(/no tiene bodegueros activos que puedan recibir/)).toBeNull();
  });

  it('en camino sin nadie que pueda recibir sí lo avisa en la cabecera', async () => {
    const screen = renderWith(rawDetail({ receivers: [] }));
    expect(await screen.findByText('La Argentina no tiene bodegueros activos que puedan recibir.')).toBeTruthy();
  });

  it('despachar: elegir receptores con búsqueda; sin ninguno no deja revisar', async () => {
    (dispatchTransfer as jest.Mock).mockResolvedValue({
      transferOrderId: 't-1',
      orderNumber: 'TR-2026-0001',
      status: 'in_transit',
      replayed: false,
      quantities: {},
    });
    const screen = renderWith(rawPendingDispatchDetail());
    await screen.findByText('Revisar y despachar');
    expect(screen.getByText('¿Quiénes pueden recibir en La Argentina?')).toBeTruthy();
    // Un traslado viejo con transportador lo trae elegido (ya no «asignado al crear»).
    expect(screen.getAllByText('Transporta: Darío').length).toBeGreaterThan(0);
    expect(screen.queryByText(/asignado al crear/)).toBeNull();

    fireEvent.press(screen.getByLabelText('Elegir quiénes pueden recibir en La Argentina'));
    // Ni quien despacha (is_me) ni el transportador aparecen.
    expect(screen.queryByLabelText('Bodeguero')).toBeNull();
    expect(screen.queryByLabelText('Darío')).toBeNull();
    fireEvent.press(screen.getByLabelText('Recibe'));
    fireEvent.press(screen.getByText('Listo'));
    expect(screen.getByText('Nadie elegido')).toBeTruthy();

    fireEvent.press(screen.getByText('Revisar y despachar'));
    expect(screen.getByText('Elige al menos una persona que pueda recibir en La Argentina.')).toBeTruthy();
    expect(dispatchTransfer).not.toHaveBeenCalled();

    fireEvent.press(screen.getByLabelText('Elegir quiénes pueden recibir en La Argentina'));
    fireEvent.changeText(screen.getByPlaceholderText('Buscar por nombre…'), 'otro');
    expect(screen.queryByLabelText('Recibe')).toBeNull();
    fireEvent.press(screen.getByLabelText('Otro Bodeguero'));
    fireEvent.press(screen.getByText('Listo'));

    fireEvent.press(screen.getByText('Revisar y despachar'));
    await act(async () => {
      fireEvent.press(screen.getByText('Confirmar despacho'));
    });
    expect(dispatchTransfer).toHaveBeenCalledWith(expect.objectContaining({ receiverIds: ['u-otro'] }));
  });

  it('detalle: dice quiénes pueden recibir (habilitados o regla anterior)', async () => {
    const screen = renderWith(
      rawDetail({
        receivers: [
          { id: 'u-recv', name: 'Recibe' },
          { id: 'u-otro', name: 'Otro Bodeguero' },
        ],
        receiversAssigned: true,
      })
    );
    expect(await screen.findByText(/Recibe, Otro Bodeguero/)).toBeTruthy();
    screen.unmount();

    const old = renderWith(rawDetail());
    expect(await old.findByText(/Cualquier bodeguero \(salvo quien despachó o transporta\)/)).toBeTruthy();
  });

  it('despachar: no deja pasar de lo reservado con +', async () => {
    const screen = renderWith(rawPendingDispatchDetail());
    await screen.findByText('Revisar y despachar');
    const plus = screen.getByLabelText('Agregar una unidad: A despachar de Lavadora LG');
    fireEvent.press(plus);
    expect(screen.getByLabelText('A despachar de Lavadora LG').props.value).toBe('3');
  });

  it('recibir: «Te enviaron…», parcial con averiada y el error del servidor tal cual', async () => {
    (receiveTransfer as jest.Mock).mockRejectedValue({
      code: '42501',
      message: 'Quien despachó el traslado no puede recibirlo',
    });
    const screen = renderWith(rawDetail());

    expect(
      await screen.findByText('Te enviaron: 3 × Lavadora LG — transporta Darío — despachado el 26/09/2026 10:00 a. m.')
    ).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Agregar una unidad: Llegó bien de Lavadora LG'));
    fireEvent.press(screen.getByLabelText('Agregar una unidad: Llegó bien de Lavadora LG'));
    fireEvent.press(screen.getByLabelText('Agregar una unidad: Llegó averiada de Lavadora LG'));
    fireEvent.press(screen.getByText('Revisar y recibir'));

    expect(
      screen.getByText(/Recibes en La Argentina: 2 unidades en buen estado y 1 unidad averiada\./)
    ).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByText('Confirmar recepción'));
    });

    expect(receiveTransfer).toHaveBeenCalledWith({
      transferOrderId: 't-1',
      items: [
        { item_id: 'i-1', quantity: 2, condition: 'ok' },
        { item_id: 'i-1', quantity: 1, condition: 'damaged' },
      ],
      reportMissing: false,
      notes: '',
      photoPath: null,
      idempotencyKey: 'key-1',
    });
    expect(screen.getByText(/Quien despachó el traslado no puede recibirlo/)).toBeTruthy();
  });

  it('recibir: «Falta» sin marcar unidades envía p_report_missing', async () => {
    (receiveTransfer as jest.Mock).mockResolvedValue({
      transferOrderId: 't-1',
      orderNumber: 'TR-2026-0001',
      status: 'with_differences',
      replayed: false,
      quantities: {},
    });
    const screen = renderWith(rawDetail());
    await screen.findByText('Revisar y recibir');

    fireEvent(screen.getByLabelText('Falta: el resto no llegó'), 'valueChange', true);
    fireEvent.press(screen.getByText('Revisar y recibir'));
    await act(async () => {
      fireEvent.press(screen.getByText('Confirmar recepción'));
    });

    expect(receiveTransfer).toHaveBeenCalledWith(expect.objectContaining({ items: [], reportMissing: true }));
    expect(await screen.findByText('Informaste que no llegó el resto de TR-2026-0001.')).toBeTruthy();
  });

  it('recibir con seriales despachados: los pide antes de confirmar', async () => {
    const screen = renderWith(
      rawDetail({
        items: [
          rawItem({
            quantity: 1,
            dispatched_quantity: 1,
            has_serials: true,
            serials: [{ serial_number: 'LAV-1', status: 'in_transit', verified: true }],
          }),
        ],
      })
    );
    await screen.findByText('Revisar y recibir');
    fireEvent.press(screen.getByText('Llegó todo en buen estado'));
    fireEvent.press(screen.getByText('Revisar y recibir'));
    expect(screen.getByText('Indica 1 serial(es): uno por unidad.')).toBeTruthy();
    expect(receiveTransfer).not.toHaveBeenCalled();

    fireEvent.changeText(screen.getByLabelText('Seriales de las que llegaron bien de Lavadora LG'), 'lav-1');
    fireEvent.press(screen.getByText('Revisar y recibir'));
    expect(screen.getByText('Confirmar recepción')).toBeTruthy();
  });

  it('sin señal: avisa y no deja confirmar, pero conserva lo marcado', async () => {
    mockOnline = false;
    const screen = renderWith(rawDetail());
    await screen.findByText('Revisar y recibir');
    expect(screen.getByText(/Sin señal: para despachar o recibir necesitas conexión/)).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Agregar una unidad: Llegó bien de Lavadora LG'));
    fireEvent.press(screen.getByText('Revisar y recibir'));
    expect(screen.queryByText('Confirmar recepción')).toBeNull();

    // El borrador queda en memoria para cuando vuelva la señal.
    const drafts = useTransferDraftStore.getState().drafts;
    expect(drafts['t-1:receive']).toMatchObject({ lines: { 'i-1': { ok: 1 } } });
  });

  it('quien transporta ve el traslado en solo lectura con el motivo', async () => {
    mockUserId = 'u-carrier';
    const screen = renderWith(rawDetail({ permissions: { can_receive: false } }));
    expect(
      await screen.findByText(
        'Transportas este traslado: al llegar, un bodeguero en La Argentina confirma la recepción.'
      )
    ).toBeTruthy();
    expect(screen.queryByText('Revisar y recibir')).toBeNull();
  });

  it('confirmar devolución al origen', async () => {
    (confirmTransferReturn as jest.Mock).mockResolvedValue({
      transferOrderId: 't-1',
      orderNumber: 'TR-2026-0001',
      status: 'closed_with_differences',
      replayed: true,
      quantities: {},
    });
    const screen = renderWith(
      rawDetail({
        order: { status: 'with_differences', pending_receipt_quantity: 0, return_pending_quantity: 1 },
        items: [rawItem({ quantity: 3, dispatched_quantity: 3, received_quantity: 2, return_pending_quantity: 1 })],
        permissions: { can_receive: false, can_confirm_return: true },
      })
    );
    await screen.findByText('Revisar y confirmar');
    fireEvent.press(screen.getByText('Volvió todo'));
    fireEvent.press(screen.getByText('Revisar y confirmar'));
    await act(async () => {
      fireEvent.press(screen.getByText('Confirmar devolución'));
    });
    expect(confirmTransferReturn).toHaveBeenCalledWith({
      transferOrderId: 't-1',
      items: [{ item_id: 'i-1', quantity: 1 }],
      notes: '',
      idempotencyKey: 'key-1',
    });
    await waitFor(() =>
      expect(
        screen.getByText(
          'Confirmaste que volvieron 1 unidad de TR-2026-0001 a Principal. (Ya estaba registrado; no se repitió.)'
        )
      ).toBeTruthy()
    );
  });

  it('error al cargar: muestra el mensaje y permite reintentar', async () => {
    fetchDetail.mockRejectedValueOnce({ message: 'El traslado no existe o no tiene permiso para verlo' });
    const screen = render(<TransferDetailScreen transferOrderId="t-1" />);
    expect(await screen.findByText('El traslado no existe o no tiene permiso para verlo')).toBeTruthy();
    expect(screen.getByText('Reintentar')).toBeTruthy();
  });
});
