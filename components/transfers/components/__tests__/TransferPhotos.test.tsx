import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';

import { TransferDetailScreen } from '../TransferDetailScreen';
import { dispatchTransfer, fetchTransferDetail, receiveTransfer } from '../../infrastructure/services/transfersService';
import { pickTransferPhoto } from '../../infrastructure/services/pickTransferPhoto';
import { useTransferDraftStore } from '../../infrastructure/store/transferDraftStore';
import { parseTransferDetail } from '../../utils/transferModel';
import { getOrCreatePersistentIdempotencyKey } from '@/lib/idempotency';
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
jest.mock('@/components/auth/infrastructure/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u-recv' } }) }));
jest.mock('@/hooks/useNetworkStatus', () => ({ useNetworkStatus: () => true }));
jest.mock('@/lib/users/sellersService', () => ({ fetchSellerOptions: jest.fn(async () => []) }));
jest.mock('@/lib/idempotency', () => ({
  getOrCreatePersistentIdempotencyKey: jest.fn(async () => 'key-1'),
  clearPersistentIdempotencyKey: jest.fn(async () => undefined),
}));
jest.mock('../../infrastructure/services/transfersService', () => ({
  fetchTransferDetail: jest.fn(),
  dispatchTransfer: jest.fn(),
  receiveTransfer: jest.fn(),
  confirmTransferReturn: jest.fn(),
}));
jest.mock('../../infrastructure/services/pickTransferPhoto', () => ({ pickTransferPhoto: jest.fn() }));

const mockUpload = jest.fn();
const mockSigned = jest.fn();
jest.mock('@/lib/supabase', () => ({
  supabase: { storage: { from: () => ({ upload: mockUpload, createSignedUrl: mockSigned }) } },
}));

const fetchDetail = fetchTransferDetail as jest.Mock;
const pick = pickTransferPhoto as jest.Mock;
const okResult = { transferOrderId: 't-1', orderNumber: 'TR-2026-0001', status: 'in_transit', replayed: false, quantities: {} };
const photo = (id: string) => ({ id, uri: `file:///${id}.jpg`, mimeType: 'image/jpeg', size: 100, uploaded: false });

function renderWith(raw: unknown) {
  fetchDetail.mockResolvedValue(parseTransferDetail(raw));
  return render(<TransferDetailScreen transferOrderId="t-1" />);
}

describe('Fotos de traslados', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useTransferDraftStore.getState().reset();
    global.fetch = jest.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(4) })) as unknown as typeof fetch;
  });

  it('despachar: la foto es opcional, se sube y viaja como p_photo_path', async () => {
    pick.mockResolvedValue(photo('carga'));
    mockUpload.mockResolvedValue({ data: {}, error: null });
    (dispatchTransfer as jest.Mock).mockResolvedValue(okResult);
    const screen = renderWith(rawPendingDispatchDetail());
    await screen.findByText('Foto de la carga (opcional)');

    await act(async () => {
      fireEvent.press(screen.getByText('Tomar foto'));
    });
    expect(pick).toHaveBeenCalledWith('camera');
    expect(screen.getByLabelText('Foto de la carga (opcional): foto adjunta')).toBeTruthy();

    fireEvent.press(screen.getByText('Revisar y despachar'));
    expect(screen.getByText(/Con foto de la carga\./)).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText('Confirmar despacho'));
    });

    expect(mockUpload).toHaveBeenCalledWith('t-1/carga.jpg', expect.any(Uint8Array), expect.objectContaining({ upsert: false }));
    expect(dispatchTransfer).toHaveBeenCalledWith(expect.objectContaining({ photoPath: 't-1/carga.jpg' }));
  });

  it('si la foto no sube no se llama la RPC; el reintento no la vuelve a subir y usa la misma clave', async () => {
    pick.mockResolvedValue(photo('carga'));
    mockUpload
      .mockResolvedValueOnce({ data: null, error: { statusCode: '403', message: 'permiso denegado' } })
      .mockResolvedValueOnce({ data: {}, error: null });
    (dispatchTransfer as jest.Mock)
      .mockRejectedValueOnce(new TypeError('Network request failed'))
      .mockResolvedValueOnce(okResult);
    const screen = renderWith(rawPendingDispatchDetail());
    await screen.findByText('Foto de la carga (opcional)');
    await act(async () => {
      fireEvent.press(screen.getByText('Galería'));
    });
    expect(pick).toHaveBeenCalledWith('gallery');
    fireEvent.press(screen.getByText('Revisar y despachar'));

    await act(async () => {
      fireEvent.press(screen.getByText('Confirmar despacho'));
    });
    expect(dispatchTransfer).not.toHaveBeenCalled();
    expect(screen.getByText(/No se pudo subir la foto \(permiso denegado\)\. No se registró nada/)).toBeTruthy();

    // Segundo intento: sube, pero la RPC se queda sin red.
    await act(async () => {
      fireEvent.press(screen.getByText('Confirmar despacho'));
    });
    expect(mockUpload).toHaveBeenCalledTimes(2);
    expect(dispatchTransfer).toHaveBeenCalledTimes(1);

    // Tercer intento: ya no sube y la huella (y la clave) es la misma.
    await act(async () => {
      fireEvent.press(screen.getByText('Confirmar despacho'));
    });
    expect(mockUpload).toHaveBeenCalledTimes(2);
    expect(dispatchTransfer).toHaveBeenCalledTimes(2);
    const prints = (getOrCreatePersistentIdempotencyKey as jest.Mock).mock.calls.map((call) => call[1]);
    expect(prints).toHaveLength(2);
    expect(prints[0]).toBe(prints[1]);
    expect(prints[0]).toContain('t-1/carga.jpg');
  });

  it('recibir: foto de la avería solo en líneas con averiadas; viaja como photo_path de esa línea', async () => {
    pick.mockResolvedValueOnce(photo('golpe')).mockResolvedValueOnce(photo('llegada'));
    mockUpload.mockResolvedValue({ data: {}, error: null });
    (receiveTransfer as jest.Mock).mockResolvedValue(okResult);
    const screen = renderWith(rawDetail({ items: [rawItem()] }));
    await screen.findByText('Foto de lo que llegó (opcional)');
    expect(screen.queryByText('Foto de la avería (opcional)')).toBeNull();

    fireEvent.press(screen.getByLabelText('Agregar una unidad: Llegó bien de Lavadora LG'));
    fireEvent.press(screen.getByLabelText('Agregar una unidad: Llegó averiada de Lavadora LG'));
    expect(screen.getByText('Foto de la avería (opcional)')).toBeTruthy();

    // Primero la de la avería (en la tarjeta), luego la general.
    await act(async () => {
      fireEvent.press(screen.getAllByText('Tomar foto')[0]);
    });
    await act(async () => {
      fireEvent.press(screen.getAllByText('Tomar foto')[0]);
    });

    fireEvent.press(screen.getByText('Revisar y recibir'));
    expect(screen.getByText(/Fotos adjuntas: 2\./)).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText('Confirmar recepción'));
    });

    expect(mockUpload).toHaveBeenCalledTimes(2);
    expect(receiveTransfer).toHaveBeenCalledWith(
      expect.objectContaining({
        photoPath: 't-1/llegada.jpg',
        items: [
          { item_id: 'i-1', quantity: 1, condition: 'ok' },
          { item_id: 'i-1', quantity: 1, condition: 'damaged', photo_path: 't-1/golpe.jpg' },
        ],
      })
    );
  });

  it('detalle: una miniatura por foto (la general no se repite por línea)', async () => {
    mockSigned.mockImplementation(async (path: string) => ({ data: { signedUrl: `https://signed/${path}` }, error: null }));
    const screen = renderWith(
      rawDetail({
        permissions: { can_receive: false },
        events: [
          { id: 'e1', event_type: 'dispatch', product_name: 'Lavadora LG', photo_path: 't-1/carga.jpg' },
          { id: 'e2', event_type: 'dispatch', product_name: 'Nevera Haceb', photo_path: 't-1/carga.jpg' },
          { id: 'e3', event_type: 'receive', product_name: 'Nevera Haceb', condition: 'damaged', photo_path: 't-1/golpe.jpg' },
        ],
      })
    );
    await screen.findByText('Despacho');
    expect(screen.getByText('Recepción · Nevera Haceb (averiada)')).toBeTruthy();
    await waitFor(() => expect(mockSigned).toHaveBeenCalledTimes(2));
    expect(mockSigned).toHaveBeenCalledWith('t-1/carga.jpg', 3600);
    await waitFor(() => expect(screen.getByLabelText('Ampliar foto: Despacho').props.accessibilityState?.disabled).toBeFalsy());
    fireEvent.press(screen.getByLabelText('Ampliar foto: Despacho'));
    expect(screen.getByLabelText('Cerrar foto')).toBeTruthy();
  });
});
