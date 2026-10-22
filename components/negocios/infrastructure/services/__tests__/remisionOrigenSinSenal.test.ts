import type { LocalOfflineOrderLine } from '@/lib/offline/repositories/deliveryOrdersRepository';
import { useSyncStore } from '@/lib/offline/store/syncStore';
import { REMISSION_NOT_ON_PHONE_MESSAGE, loadRemissionOriginGroups } from '../negociosOfflineOrdersService';

/**
 * Crear negocio desde una remisión: si se eligió de la lista del servidor y la
 * señal se cae (o no responde a tiempo) antes de cargar sus productos, salía
 * la alerta de error aunque la remisión estuviera guardada en el teléfono.
 */

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

const LINE: LocalOfflineOrderLine = {
  orderId: 'rem-1', groupKind: 'own', sourceOrderId: 'rem-1', sourceOrderNumber: 'REM-0042',
  sourceCustomerId: null, sourceCustomerName: null, sourceHasNegocio: false,
  productId: 'p-cama', productName: 'CAMA', productSku: null,
  warehouseId: 'w1', warehouseName: 'La Argentina', quantity: 3, availableQuantity: 2,
};

jest.mock('@/lib/offline/repositories/deliveryOrdersRepository', () => ({
  listLocalOfflineOrders: jest.fn(async () => [{ id: 'rem-1' }]),
  getLocalOfflineOrderLines: jest.fn(async (id: string) => (id === 'rem-1' ? [mockLine()] : [])),
  listLocalPendingRemissions: jest.fn(async () => []),
  pendingLocalQuantitiesByOrigin: jest.fn(async () => new Map()),
}));
function mockLine() { return LINE; }

const NETWORK_ERROR = new Error('TypeError: Network request failed');

beforeEach(() => {
  useSyncStore.setState({ online: true });
});

describe('loadRemissionOriginGroups', () => {
  it('elegida con señal y la red falla: los grupos salen de la foto del teléfono', async () => {
    const remote = jest.fn().mockRejectedValue(NETWORK_ERROR);
    const groups = await loadRemissionOriginGroups('rem-1', false, remote);
    expect(remote).toHaveBeenCalledWith('rem-1');
    expect(groups).toHaveLength(1);
    expect(groups[0].items[0]).toMatchObject({ product_id: 'p-cama', warehouse_id: 'w1' });
  });

  it('sin señal no consulta al servidor', async () => {
    useSyncStore.setState({ online: false });
    const remote = jest.fn();
    const groups = await loadRemissionOriginGroups('rem-1', false, remote);
    expect(remote).not.toHaveBeenCalled();
    expect(groups).toHaveLength(1);
  });

  it('si la remisión no se llevó al teléfono, dice cómo llevarla', async () => {
    const remote = jest.fn().mockRejectedValue(NETWORK_ERROR);
    await expect(loadRemissionOriginGroups('rem-otra', false, remote)).rejects.toThrow(REMISSION_NOT_ON_PHONE_MESSAGE);
  });

  it('un error del servidor que no es de red se sigue mostrando', async () => {
    const remote = jest.fn().mockRejectedValue(new Error('not authorized'));
    await expect(loadRemissionOriginGroups('rem-1', false, remote)).rejects.toThrow('not authorized');
  });

  it('con señal usa lo del servidor', async () => {
    const remote = jest.fn().mockResolvedValue([{ key: 'srv' }]);
    await expect(loadRemissionOriginGroups('rem-1', false, remote)).resolves.toEqual([{ key: 'srv' }]);
  });
});
