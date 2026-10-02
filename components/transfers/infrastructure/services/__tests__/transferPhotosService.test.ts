import { supabase } from '@/lib/supabase';
import {
  TransferPhotoUploadError,
  deleteTransferPhotos,
  getTransferPhotoSignedUrl,
  uploadPendingTransferPhotos,
  uploadTransferPhoto,
} from '../transferPhotosService';
import { dispatchTransfer, receiveTransfer } from '../transfersService';

const mockUpload = jest.fn();
const mockSigned = jest.fn();
const mockRemove = jest.fn();
jest.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: jest.fn(),
    storage: { from: jest.fn(() => ({ upload: mockUpload, createSignedUrl: mockSigned, remove: mockRemove })) },
  },
}));

const rpc = supabase.rpc as jest.Mock;
const photo = (id: string, uploaded = false) => ({ id, uri: `file:///${id}.jpg`, mimeType: 'image/jpeg', size: 10, uploaded });

describe('transferPhotosService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) })) as unknown as typeof fetch;
  });

  it('sube a transfer-photos en <traslado>/<uuid>.jpg sin pisar', async () => {
    mockUpload.mockResolvedValue({ data: {}, error: null });
    await expect(uploadTransferPhoto('t-1', photo('abc'))).resolves.toBe('t-1/abc.jpg');
    expect(supabase.storage.from).toHaveBeenCalledWith('transfer-photos');
    expect(mockUpload).toHaveBeenCalledWith('t-1/abc.jpg', expect.any(Uint8Array), {
      contentType: 'image/jpeg',
      upsert: false,
      cacheControl: '3600',
    });
  });

  it('una foto ya subida no se vuelve a subir; «ya existe» cuenta como subida', async () => {
    await expect(uploadTransferPhoto('t-1', photo('abc', true))).resolves.toBe('t-1/abc.jpg');
    expect(mockUpload).not.toHaveBeenCalled();

    mockUpload.mockResolvedValue({ data: null, error: { statusCode: '409', message: 'The resource already exists' } });
    await expect(uploadTransferPhoto('t-1', photo('abc'))).resolves.toBe('t-1/abc.jpg');
  });

  it('borra solo las fotos ya subidas y nunca lanza', async () => {
    mockRemove.mockResolvedValue({ data: [], error: null });
    await deleteTransferPhotos('t-1', [photo('a', true), photo('b')]);
    expect(mockRemove).toHaveBeenCalledWith(['t-1/a.jpg']);

    mockRemove.mockClear();
    await deleteTransferPhotos('t-1', [photo('b')]);
    expect(mockRemove).not.toHaveBeenCalled();

    mockRemove.mockRejectedValueOnce(new Error('Network request failed'));
    await expect(deleteTransferPhotos('t-1', [photo('a', true)])).resolves.toBeUndefined();
    mockRemove.mockResolvedValueOnce({ data: null, error: { message: 'denied' } });
    await expect(deleteTransferPhotos('t-1', [photo('a', true)])).resolves.toBeUndefined();
  });

  it('un error de Storage lanza TransferPhotoUploadError', async () => {
    mockUpload.mockResolvedValue({ data: null, error: { statusCode: '403', message: 'new row violates row-level security' } });
    await expect(uploadTransferPhoto('t-1', photo('abc'))).rejects.toBeInstanceOf(TransferPhotoUploadError);
  });

  it('sube las pendientes en orden, marca cada una y se detiene en la que falla', async () => {
    mockUpload
      .mockResolvedValueOnce({ data: {}, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'Payload too large' } });
    const uploaded: string[] = [];
    await expect(
      uploadPendingTransferPhotos('t-1', [photo('ya', true), photo('a'), photo('b'), photo('c')], (p) => uploaded.push(p.id))
    ).rejects.toThrow('Payload too large');
    expect(uploaded).toEqual(['a']);
    expect(mockUpload).toHaveBeenCalledTimes(2);
  });

  it('URL firmada por una hora', async () => {
    mockSigned.mockResolvedValue({ data: { signedUrl: 'https://x/signed' }, error: null });
    await expect(getTransferPhotoSignedUrl('t-1/abc.jpg')).resolves.toBe('https://x/signed');
    expect(mockSigned).toHaveBeenCalledWith('t-1/abc.jpg', 3600);
  });

  it('las RPC reciben p_photo_path y photo_path por línea', async () => {
    rpc.mockResolvedValue({ data: { transfer_order_id: 't-1', status: 'in_transit' }, error: null });
    await dispatchTransfer({
      transferOrderId: 't-1',
      items: [{ item_id: 'i-1', quantity: 1 }],
      notes: '',
      photoPath: 't-1/carga.jpg',
      idempotencyKey: 'k',
    });
    expect(rpc).toHaveBeenLastCalledWith('dispatch_transfer_order', expect.objectContaining({ p_photo_path: 't-1/carga.jpg' }));

    const items = [{ item_id: 'i-1', quantity: 1, condition: 'damaged' as const, photo_path: 't-1/golpe.jpg' }];
    await receiveTransfer({
      transferOrderId: 't-1',
      items,
      reportMissing: false,
      notes: '',
      photoPath: 't-1/llegada.jpg',
      idempotencyKey: 'k',
    });
    expect(rpc).toHaveBeenLastCalledWith(
      'receive_transfer_order',
      expect.objectContaining({ p_items: items, p_photo_path: 't-1/llegada.jpg' })
    );
  });
});
