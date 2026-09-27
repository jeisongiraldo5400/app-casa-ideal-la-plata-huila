import { attachOrQueuePagoSupport } from '../pagoSupportAttach';
import { canUseLocalDb, queueSupportForExistingPago } from '@/lib/offline/repositories/offlineRepository';
import { uploadAndAttachPagoSupport } from '@/lib/uploadPagoSupport';

jest.mock('@/lib/offline/repositories/offlineRepository', () => ({
  canUseLocalDb: jest.fn(() => true),
  queueSupportForExistingPago: jest.fn(async () => ({})),
}));
jest.mock('@/lib/uploadPagoSupport', () => ({
  uploadAndAttachPagoSupport: jest.fn(async () => ({})),
  validatePagoSupportLocalFile: (file: { mimeType: string }) =>
    file.mimeType === 'text/plain' ? 'Solo se permiten imágenes JPG/PNG/WebP o PDF' : null,
}));

const mockedUpload = uploadAndAttachPagoSupport as jest.Mock;
const mockedQueue = queueSupportForExistingPago as jest.Mock;
const mockedLocalDb = canUseLocalDb as jest.Mock;
const file = { uri: 'file:///s.jpg', mimeType: 'image/jpeg', name: 's.jpg' };
const base = { negocioId: 'n1', pagoId: 'p1', file };
const networkError = () => new TypeError('Network request failed');

beforeEach(() => {
  jest.clearAllMocks();
  mockedLocalDb.mockReturnValue(true);
});

describe('attachOrQueuePagoSupport', () => {
  it('con señal sube y adjunta', async () => {
    await expect(attachOrQueuePagoSupport({ ...base, online: true })).resolves.toBe('attached');
    expect(mockedUpload).toHaveBeenCalledWith({ negocioId: 'n1', pagoId: 'p1', file });
    expect(mockedQueue).not.toHaveBeenCalled();
  });

  it('sin señal copia y encola sin intentar la red', async () => {
    await expect(attachOrQueuePagoSupport({ ...base, online: false })).resolves.toBe('queued');
    expect(mockedUpload).not.toHaveBeenCalled();
    expect(mockedQueue).toHaveBeenCalledWith({ negocioId: 'n1', pagoId: 'p1', file });
  });

  it('pago aún en la cola del teléfono: siempre encola', async () => {
    await expect(attachOrQueuePagoSupport({ ...base, online: true, pagoIsLocal: true })).resolves.toBe('queued');
    expect(mockedUpload).not.toHaveBeenCalled();
  });

  it('si la subida se corta por red, encola', async () => {
    mockedUpload.mockRejectedValueOnce(networkError());
    await expect(attachOrQueuePagoSupport({ ...base, online: true })).resolves.toBe('queued');
  });

  it('un rechazo del servidor se muestra (no se encola) salvo queueOnAnyError', async () => {
    mockedUpload.mockRejectedValueOnce(new Error('Sin permiso para adjuntar soporte a este pago'));
    await expect(attachOrQueuePagoSupport({ ...base, online: true })).rejects.toThrow(/Sin permiso/);
    expect(mockedQueue).not.toHaveBeenCalled();

    mockedUpload.mockRejectedValueOnce(new Error('bucket'));
    await expect(attachOrQueuePagoSupport({ ...base, online: true, queueOnAnyError: true })).resolves.toBe('queued');
  });

  it('sin señal y sin base local no se puede', async () => {
    mockedLocalDb.mockReturnValue(false);
    await expect(attachOrQueuePagoSupport({ ...base, online: false })).rejects.toThrow(/Sin conexión/);
  });

  it('valida el archivo antes de todo', async () => {
    await expect(
      attachOrQueuePagoSupport({ ...base, file: { ...file, mimeType: 'text/plain' }, online: true })
    ).rejects.toThrow(/Solo se permiten/);
    expect(mockedUpload).not.toHaveBeenCalled();
  });
});
