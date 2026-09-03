import { supabase } from '@/lib/supabase';
import { useNegociosStore } from '../negociosStore';
import { isNetworkError } from '@/lib/offline/security/sessionPolicy';
import { canUseLocalDb, fetchNegociosListFromLocal } from '@/lib/offline/repositories/offlineRepository';

jest.mock('@/lib/supabase', () => ({
  supabase: { from: jest.fn() },
}));

jest.mock('@/lib/offline/security/sessionPolicy', () => ({
  isNetworkError: jest.fn(() => false),
}));

jest.mock('@/lib/offline/repositories/offlineRepository', () => ({
  canUseLocalDb: jest.fn(() => false),
  fetchNegociosListFromLocal: jest.fn(),
}));

function mockQueryResult(result: { data: unknown; error: unknown }) {
  const builder: any = {};
  ['select', 'is', 'eq', 'order', 'limit'].forEach((method) => {
    builder[method] = jest.fn(() => builder);
  });
  builder.then = (resolve: (value: typeof result) => void) => resolve(result);
  return builder;
}

const mockFrom = supabase.from as jest.Mock;
const mockIsNetworkError = isNetworkError as jest.Mock;
const mockCanUseLocalDb = canUseLocalDb as jest.Mock;
const mockFetchLocal = fetchNegociosListFromLocal as jest.Mock;

describe('negociosStore.fetchMyList', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsNetworkError.mockReturnValue(false);
    mockCanUseLocalDb.mockReturnValue(false);
    useNegociosStore.setState({ myList: [], myLoading: false, myFromCache: false, myError: null });
  });

  it('filtra por seller_id y calcula remaining_balance/has_mora igual que fetchList', async () => {
    const builder = mockQueryResult({
      data: [
        {
          id: 'n1',
          numero: 1,
          seller_id: 'seller-1',
          customer: { name: 'Ana' },
          negocio_cuotas: [
            { amount: 100, paid_amount: 40, late_fee_amount: 0, status: 'parcial', deleted_at: null },
            { amount: 100, paid_amount: 0, late_fee_amount: 0, status: 'mora', deleted_at: null },
          ],
        },
      ],
      error: null,
    });
    mockFrom.mockReturnValue(builder);

    await useNegociosStore.getState().fetchMyList('seller-1');

    expect(mockFrom).toHaveBeenCalledWith('negocios');
    expect(builder.eq).toHaveBeenCalledWith('seller_id', 'seller-1');
    const state = useNegociosStore.getState();
    expect(state.myList).toHaveLength(1);
    expect(state.myList[0].remaining_balance).toBe(160);
    expect(state.myList[0].has_mora).toBe(true);
    expect(state.myFromCache).toBe(false);
    expect(state.myError).toBeNull();
  });

  it('cae al caché local filtrado por seller_id cuando hay error de red', async () => {
    mockFrom.mockReturnValue(
      mockQueryResult({ data: null, error: new Error('network down') })
    );
    mockIsNetworkError.mockReturnValue(true);
    mockCanUseLocalDb.mockReturnValue(true);
    mockFetchLocal.mockResolvedValue([
      { id: 'n1', seller_id: 'seller-1', numero: 1 },
      { id: 'n2', seller_id: 'other-seller', numero: 2 },
    ]);

    await useNegociosStore.getState().fetchMyList('seller-1');

    const state = useNegociosStore.getState();
    expect(state.myList).toEqual([{ id: 'n1', seller_id: 'seller-1', numero: 1 }]);
    expect(state.myFromCache).toBe(true);
    expect(state.myError).toBeNull();
  });

  it('reporta un error legible cuando falla sin conexión local disponible', async () => {
    mockFrom.mockReturnValue(
      mockQueryResult({ data: null, error: new Error('boom') })
    );
    mockIsNetworkError.mockReturnValue(false);

    await useNegociosStore.getState().fetchMyList('seller-1');

    const state = useNegociosStore.getState();
    expect(state.myList).toEqual([]);
    expect(state.myError).toBe('boom');
  });
});
