import { act, renderHook, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { attachOrQueuePagoSupport } from '@/lib/pagoSupportAttach';
import { useAttachPagoSupport } from '../useAttachPagoSupport';

jest.mock('@/lib/pagoSupportAttach', () => ({ attachOrQueuePagoSupport: jest.fn() }));
jest.mock('@/lib/pickPagoSupportFile', () => ({ pickPagoSupportFile: jest.fn(async () => null) }));
let mockOnline = true;
jest.mock('@/lib/offline/store/syncStore', () => ({
  useSyncStore: { getState: () => ({ online: mockOnline }) },
}));

const mockedAttach = attachOrQueuePagoSupport as jest.Mock;
const file = { uri: 'file:///s.pdf', mimeType: 'application/pdf', name: 's.pdf' };
const target = {
  negocioId: 'n1',
  pagoId: 'p1',
  title: '$ 100.000 · RV-1',
  supportRequired: true,
  methodName: 'Consignación',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockOnline = true;
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});

async function openWithFile(onDone = jest.fn(), overrides: Partial<typeof target> & { pagoIsLocal?: boolean } = {}) {
  const pickSupport = jest.fn(async () => file);
  const hook = renderHook(() => useAttachPagoSupport({ onDone, pickSupport }));
  act(() => hook.result.current.open({ ...target, ...overrides }));
  act(() => hook.result.current.pick('document'));
  await waitFor(() => expect(hook.result.current.file).toEqual(file));
  return { ...hook, onDone };
}

describe('useAttachPagoSupport', () => {
  it('con señal adjunta, cierra y avisa', async () => {
    mockedAttach.mockResolvedValueOnce('attached');
    const { result, onDone } = await openWithFile();
    await act(async () => result.current.submit());
    expect(mockedAttach).toHaveBeenCalledWith({ negocioId: 'n1', pagoId: 'p1', file, online: true, pagoIsLocal: undefined });
    expect(result.current.visible).toBe(false);
    expect(onDone).toHaveBeenCalledWith('attached', expect.objectContaining({ pagoId: 'p1' }));
    expect(Alert.alert).toHaveBeenCalledWith('Soporte adjuntado', expect.any(String));
  });

  it('sin señal pasa online=false y el pago local va a la cola', async () => {
    mockOnline = false;
    mockedAttach.mockResolvedValueOnce('queued');
    const { result } = await openWithFile(jest.fn(), { pagoIsLocal: true });
    await act(async () => result.current.submit());
    expect(mockedAttach).toHaveBeenCalledWith(expect.objectContaining({ online: false, pagoIsLocal: true }));
    expect(Alert.alert).toHaveBeenCalledWith('Soporte guardado sin conexión', expect.any(String));
  });

  it('si el servidor lo rechaza, la hoja sigue abierta con el archivo', async () => {
    mockedAttach.mockRejectedValueOnce(new Error('Sin permiso para adjuntar soporte a este pago'));
    const { result, onDone } = await openWithFile();
    await act(async () => result.current.submit());
    expect(result.current.visible).toBe(true);
    expect(result.current.file).toEqual(file);
    expect(onDone).not.toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenCalledWith('Error', 'Sin permiso para adjuntar soporte a este pago');
  });
});
