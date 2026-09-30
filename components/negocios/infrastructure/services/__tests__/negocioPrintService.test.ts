import { recordNegocioPrint } from '../negocioPrintService';

const mockRpc = jest.fn();
const mockQueue = jest.fn();
const mockFindPending = jest.fn();
const mockStorage = new Map<string, string>();
let mockOnline = true;

jest.mock('@/lib/supabase', () => ({
  supabase: { rpc: (...args: unknown[]) => mockRpc(...args) },
}));
jest.mock('@/lib/offline/store/syncStore', () => ({
  useSyncStore: { getState: () => ({ online: mockOnline }) },
}));
jest.mock('@/lib/offline/repositories/offlineRepository', () => ({
  queuePrintOffline: (...args: unknown[]) => mockQueue(...args),
  findPendingPagoCommand: (...args: unknown[]) => mockFindPending(...args),
}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: async (key: string) => mockStorage.get(key) ?? null,
  setItem: async (key: string, value: string) => {
    mockStorage.set(key, value);
  },
}));
jest.mock('@/lib/idempotency', () => ({ createIdempotencyKey: () => 'evt-1' }));

describe('recordNegocioPrint', () => {
  beforeEach(() => {
    mockRpc.mockReset();
    mockQueue.mockReset().mockResolvedValue(true);
    mockFindPending.mockReset().mockResolvedValue(null);
    mockStorage.clear();
    mockOnline = true;
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('con red usa el número del servidor', async () => {
    mockRpc.mockResolvedValue({ data: { copy_number: 2, printed_at: 't', printed_by_name: 'Ana' }, error: null });
    const copy = await recordNegocioPrint({ negocioId: 'n1', document: 'contrato', format: 'pdf', pagoId: 'p9' });
    expect(copy).toEqual({ number: 2, printedAt: 't', printedBy: 'Ana' });
    expect(mockRpc).toHaveBeenCalledWith('register_negocio_print', expect.objectContaining({
      p_negocio_id: 'n1', p_document: 'contrato', p_format: 'pdf', p_channel: 'movil', p_pago_id: null, p_client_event_id: 'evt-1',
    }));
    expect(mockQueue).not.toHaveBeenCalled();
  });

  it('sin señal numera con lo conocido y encola', async () => {
    mockRpc.mockResolvedValue({ data: { copy_number: 3 }, error: null });
    await recordNegocioPrint({ negocioId: 'n1', document: 'contrato', format: 'pdf' });
    mockOnline = false;
    const copy = await recordNegocioPrint({ negocioId: 'n1', document: 'contrato', format: 'ticket', printedByName: 'Luis' });
    expect(copy).toEqual(expect.objectContaining({ number: 4, printedBy: 'Luis' }));
    expect(mockQueue).toHaveBeenCalledWith(expect.objectContaining({ copyNumber: 4, clientEventId: 'evt-1', format: 'ticket' }));
  });

  it('el recibo de un pago en cola viaja en el carril del pago, aunque haya red', async () => {
    mockFindPending.mockResolvedValue({ idempotencyKey: 'k1', lane: 'route:r1' });
    const copy = await recordNegocioPrint({ negocioId: 'n1', document: 'recibo', format: 'ticket', pendingPagoLocalId: 'local-1' });
    expect(copy?.number).toBe(1);
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockQueue).toHaveBeenCalledWith(expect.objectContaining({
      pagoId: null, pagoIdempotencyKey: 'k1', lane: 'route:r1', copyNumber: 1,
    }));
  });

  it('una red caída a mitad cae a la cola', async () => {
    mockRpc.mockRejectedValue(new Error('Network request failed'));
    const copy = await recordNegocioPrint({ negocioId: 'n1', document: 'recibo', format: 'pdf', pagoId: 'p1' });
    expect(copy?.number).toBe(1);
    expect(mockQueue).toHaveBeenCalledWith(expect.objectContaining({ pagoId: 'p1' }));
  });

  it('un rechazo del servidor no bloquea: imprime sin marca', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'No tiene permiso sobre este negocio' } });
    expect(await recordNegocioPrint({ negocioId: 'n1', document: 'contrato', format: 'pdf' })).toBeNull();
    expect(mockQueue).not.toHaveBeenCalled();
  });
});
