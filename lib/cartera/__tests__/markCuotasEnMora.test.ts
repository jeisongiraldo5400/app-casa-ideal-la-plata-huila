import { markCuotasEnMora } from '../carteraService';
import { supabase } from '@/lib/supabase';

jest.mock('@/lib/supabase', () => ({
  supabase: { rpc: jest.fn() },
}));

jest.mock('@/lib/offline/repositories/offlineRepository', () => ({
  fetchCarteraDashboardFromLocal: jest.fn(),
  fetchCarteraFromLocal: jest.fn(),
  fetchMunicipiosFromLocal: jest.fn(),
  loadReportSnapshot: jest.fn(),
  saveReportSnapshot: jest.fn(),
}));

const mockedRpc = supabase.rpc as unknown as jest.Mock;

describe('markCuotasEnMora', () => {
  beforeEach(() => {
    mockedRpc.mockReset();
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('llama al RPC de escritura una sola vez', async () => {
    mockedRpc.mockResolvedValue({ error: null });

    await markCuotasEnMora();

    expect(mockedRpc).toHaveBeenCalledTimes(1);
    expect(mockedRpc).toHaveBeenCalledWith('mark_cuotas_en_mora', { p_negocio_id: null });
  });

  it('comparte la escritura entre dos cargas simultáneas', async () => {
    mockedRpc.mockResolvedValue({ error: null });

    await Promise.all([markCuotasEnMora(), markCuotasEnMora()]);

    expect(mockedRpc).toHaveBeenCalledTimes(1);
  });

  it('no interrumpe la lectura cuando la mora falla', async () => {
    mockedRpc.mockResolvedValue({ error: { message: 'permiso denegado' } });

    await expect(markCuotasEnMora()).resolves.toBeUndefined();
    expect(console.warn).toHaveBeenCalledWith('permiso denegado');
  });

  it('no propaga un fallo de red', async () => {
    mockedRpc.mockRejectedValue(new Error('Network request failed'));

    await expect(markCuotasEnMora()).resolves.toBeUndefined();
  });
});
