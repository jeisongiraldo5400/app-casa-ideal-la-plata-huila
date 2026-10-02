import { supabase } from '@/lib/supabase';
import {
  fetchMyWarehouses,
  fetchWarehouseHistory,
  fetchWarehouseStock,
  fetchWarehouseTransfers,
  isWarehousesUnavailableError,
  warehouseErrorMessage,
} from '../warehousesService';
import { rawHistoryRow, rawStockRow, rawWarehouse } from '../../../__fixtures__/warehouseFixtures';
import { rawOrder } from '@/components/transfers/__fixtures__/transferFixtures';

jest.mock('@/lib/supabase', () => ({ supabase: { rpc: jest.fn() } }));

const rpc = supabase.rpc as jest.Mock;

describe('warehousesService', () => {
  beforeEach(() => jest.clearAllMocks());

  it('list_my_warehouses se llama sin parámetros y se mapea', async () => {
    rpc.mockResolvedValueOnce({ data: { is_admin: false, warehouses: [rawWarehouse()] }, error: null });
    const result = await fetchMyWarehouses();
    expect(rpc).toHaveBeenCalledWith('list_my_warehouses');
    expect(result.isAdmin).toBe(false);
    expect(result.warehouses[0]).toMatchObject({ name: 'La Argentina', totalUnits: 340, incomingTransfers: 2 });
  });

  it('get_warehouse_stock: búsqueda recortada, página y tamaño de 30', async () => {
    rpc.mockResolvedValueOnce({ data: { total_count: 1, rows: [rawStockRow()] }, error: null });
    const page = await fetchWarehouseStock({ warehouseId: 'w-1', search: '  lavadora ', page: 2 });
    expect(rpc).toHaveBeenCalledWith('get_warehouse_stock', {
      p_warehouse_id: 'w-1',
      p_search: 'lavadora',
      p_page: 2,
      p_page_size: 30,
    });
    expect(page.rows[0]).toMatchObject({ productId: 'p-1', quantity: 4, incoming: 2 });
  });

  it('get_warehouse_history: tipos y fechas opcionales, sin búsqueda', async () => {
    rpc.mockResolvedValue({ data: { total_count: 1, rows: [rawHistoryRow()] }, error: null });
    const page = await fetchWarehouseHistory({
      warehouseId: 'w-1',
      movementTypes: ['exit'],
      dateFrom: '2026-09-01',
      dateTo: '2026-09-30',
      page: 1,
    });
    expect(rpc).toHaveBeenLastCalledWith('get_warehouse_history', {
      p_warehouse_id: 'w-1',
      p_date_from: '2026-09-01',
      p_date_to: '2026-09-30',
      p_movement_types: ['exit'],
      p_search: '',
      p_page: 1,
      p_page_size: 20,
    });
    expect(page.rows[0].movementType).toBe('exit');

    await fetchWarehouseHistory({ warehouseId: 'w-1', movementTypes: null, dateFrom: null, dateTo: null, page: 3 });
    expect(rpc).toHaveBeenLastCalledWith('get_warehouse_history', {
      p_warehouse_id: 'w-1',
      p_date_from: undefined,
      p_date_to: undefined,
      p_movement_types: undefined,
      p_search: '',
      p_page: 3,
      p_page_size: 20,
    });
  });

  it('traslados: en camino hacia la bodega y por despachar desde ella', async () => {
    rpc
      .mockResolvedValueOnce({ data: { total_count: 1, rows: [rawOrder({ id: 'in-1' })] }, error: null })
      .mockResolvedValueOnce({
        data: { total_count: 1, rows: [rawOrder({ id: 'pd-1', status: 'pending_dispatch' })] },
        error: null,
      });
    const result = await fetchWarehouseTransfers('w-1');
    expect(rpc).toHaveBeenNthCalledWith(1, 'list_transfer_orders_page', {
      p_statuses: ['in_transit', 'partially_received', 'with_differences'],
      p_destination_warehouse_id: 'w-1',
      p_page: 1,
      p_page_size: 50,
    });
    expect(rpc).toHaveBeenNthCalledWith(2, 'list_transfer_orders_page', {
      p_statuses: ['pending_dispatch'],
      p_source_warehouse_id: 'w-1',
      p_page: 1,
      p_page_size: 50,
    });
    expect(result.incoming.rows[0].id).toBe('in-1');
    expect(result.pendingDispatch.rows[0].status).toBe('pending_dispatch');
  });

  it('el rechazo por permiso llega legible, tal como lo escribe el servidor', async () => {
    const denied = { code: '42501', message: 'Sin permiso para ver esta bodega', details: null };
    rpc.mockResolvedValueOnce({ data: null, error: denied });
    await expect(fetchWarehouseStock({ warehouseId: 'w-9', search: '', page: 1 })).rejects.toBe(denied);
    expect(warehouseErrorMessage(denied, 'x')).toBe('Sin permiso para ver esta bodega');
    expect(
      warehouseErrorMessage(
        { code: '42501', message: 'Sin permiso para ver el historial de esta bodega' },
        'x'
      )
    ).toBe('Sin permiso para ver el historial de esta bodega');
  });

  it('servidor sin la migración: aviso propio', async () => {
    const missing = { code: 'PGRST202', message: 'Could not find the function public.list_my_warehouses' };
    expect(isWarehousesUnavailableError(missing)).toBe(true);
    expect(isWarehousesUnavailableError(new Error('otra cosa'))).toBe(false);
    expect(warehouseErrorMessage(missing, 'x')).toMatch(/todavía no tiene la consulta de bodegas/);
    rpc.mockResolvedValueOnce({ data: null, error: missing });
    await expect(fetchMyWarehouses()).rejects.toBe(missing);
  });
});
