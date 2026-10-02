import { parseMyWarehouses, parseWarehouseHistoryPage, parseWarehouseStockPage } from '../warehouseModel';
import { rawHistoryRow, rawStockRow, rawWarehouse } from '../../__fixtures__/warehouseFixtures';

describe('warehouseModel', () => {
  it('list_my_warehouses: numeric como texto, encargados y bandera de admin', () => {
    const result = parseMyWarehouses({ is_admin: true, warehouses: [rawWarehouse(), rawWarehouse({ id: null })] });
    expect(result.isAdmin).toBe(true);
    expect(result.warehouses).toHaveLength(1);
    expect(result.warehouses[0]).toEqual({
      id: 'w-1',
      name: 'La Argentina',
      city: 'Pitalito',
      address: 'Cra 4 # 5-10',
      isActive: true,
      totalProducts: 12,
      totalUnits: 340,
      incomingTransfers: 2,
      incomingUnits: 7,
      pendingDispatch: 1,
      isManager: true,
      managers: ['Ana Bodega', 'Luis Pérez'],
    });
  });

  it('respuesta vacía o rara no tumba la pantalla', () => {
    expect(parseMyWarehouses(null)).toEqual({ isAdmin: false, warehouses: [] });
    expect(parseMyWarehouses({ warehouses: [{ id: 'w-2', managers: null, city: '' }] }).warehouses[0]).toMatchObject({
      name: 'Bodega',
      city: null,
      managers: [],
      totalUnits: 0,
    });
  });

  it('get_warehouse_stock: filas, total y bodega', () => {
    const page = parseWarehouseStockPage({
      warehouse: { id: 'w-1', name: 'La Argentina', is_active: true },
      total_count: '31',
      rows: [rawStockRow(), rawStockRow({ product_id: 'p-2', sku: null, barcode: '', incoming: '0' })],
    });
    expect(page.totalCount).toBe(31);
    expect(page.warehouse).toEqual({ id: 'w-1', name: 'La Argentina', isActive: true });
    expect(page.rows[0]).toEqual({
      productId: 'p-1',
      name: 'Lavadora LG',
      sku: 'LAV-01',
      barcode: '7701',
      quantity: 4,
      incoming: 2,
    });
    expect(page.rows[1]).toMatchObject({ sku: null, barcode: null, incoming: 0 });
  });

  it('get_warehouse_history: mapea las columnas y descarta tipos desconocidos', () => {
    const page = parseWarehouseHistoryPage({
      warehouse: { id: 'w-1', name: 'La Argentina', is_active: true, deleted: false },
      total_count: 2,
      rows: [rawHistoryRow(), rawHistoryRow({ key: 'x', movement_type: 'algo_nuevo' })],
    });
    expect(page.totalCount).toBe(2);
    expect(page.rows).toHaveLength(1);
    expect(page.rows[0]).toEqual({
      key: 'ex:1',
      movementType: 'exit',
      occurredAt: '2026-09-30T15:30:00Z',
      productId: 'p-1',
      productName: 'Lavadora LG',
      productSku: 'LAV-01',
      quantity: -2,
      stockEffect: -2,
      stockAfter: 2,
      documentType: 'delivery_order',
      documentId: 'do-1',
      documentNumber: 'OE-2026-0042',
      detail: null,
      notes: null,
      userName: 'Ana Bodega',
      isCancelled: false,
      serials: ['SN-1'],
    });
  });

  it('historial: cantidad nula y documento desconocido quedan en null', () => {
    const [row] = parseWarehouseHistoryPage({
      rows: [rawHistoryRow({ movement_type: 'warehouse_change', quantity: null, stock_after: '', document_type: 'otro' })],
    }).rows;
    expect(row).toMatchObject({ quantity: null, stockAfter: null, documentType: null });
  });
});
