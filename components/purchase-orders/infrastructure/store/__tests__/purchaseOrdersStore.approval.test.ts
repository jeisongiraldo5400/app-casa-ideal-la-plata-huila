import { supabase } from '@/lib/supabase';
import { usePurchaseOrdersStore } from '../purchaseOrdersStore';

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
    rpc: jest.fn(),
  },
}));

jest.mock('@/lib/operationLogger', () => ({
  logOperationError: jest.fn(),
}));

function updateChain(result: { error: unknown }) {
  const chain: any = {
    update: jest.fn(() => chain),
    eq: jest.fn(() => Promise.resolve(result)),
  };
  return chain;
}

describe('purchaseOrdersStore: solo el admin aprueba', () => {
  afterEach(() => jest.restoreAllMocks());

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    usePurchaseOrdersStore.setState({ purchaseOrders: [], loading: false, error: null });
  });

  it('rechaza aprobar sin permiso de admin y no llama al servidor', async () => {
    const result = await usePurchaseOrdersStore.getState().updatePurchaseOrderStatus('po-1', 'approved');
    expect(result).toEqual({
      success: false,
      error: 'Solo un administrador puede aprobar órdenes de compra.',
    });
    expect(supabase.from).not.toHaveBeenCalled();
    expect(usePurchaseOrdersStore.getState().loading).toBe(false);

    await usePurchaseOrdersStore
      .getState()
      .updatePurchaseOrderStatus('po-1', 'approved', { canApprove: false });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('el admin aprueba y el bodeguero sigue marcando recibida', async () => {
    const chain = updateChain({ error: null });
    (supabase.from as jest.Mock).mockReturnValue(chain);

    await expect(
      usePurchaseOrdersStore.getState().updatePurchaseOrderStatus('po-1', 'approved', { canApprove: true })
    ).resolves.toEqual({ success: true, error: null });
    expect(chain.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'approved' }));

    await expect(
      usePurchaseOrdersStore.getState().updatePurchaseOrderStatus('po-1', 'received')
    ).resolves.toEqual({ success: true, error: null });
    expect(chain.update).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'received' }));
  });

  it('muestra el mensaje del servidor si la guarda rechaza la aprobación', async () => {
    const message = 'Solo un administrador puede aprobar la orden de compra OC-2026-0009.';
    (supabase.from as jest.Mock).mockReturnValue(updateChain({ error: { message } }));

    await expect(
      usePurchaseOrdersStore.getState().updatePurchaseOrderStatus('po-1', 'approved', { canApprove: true })
    ).resolves.toEqual({ success: false, error: message });
  });
});
