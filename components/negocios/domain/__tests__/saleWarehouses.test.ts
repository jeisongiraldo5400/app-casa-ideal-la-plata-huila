import {
  SIN_BODEGAS_DE_VENTA,
  UNRESTRICTED_SALE_ACCESS,
  filterStockMap,
  filterStockRows,
  hasNoSaleWarehouses,
  itemWarehouseAllowed,
  saleAccessFor,
  saleWarehouseItemsError,
  type SaleWarehouseAccess,
} from '../saleWarehouses';

const rows = [
  { warehouse_id: 'w1', warehouse_name: 'Principal', quantity: 5 },
  { warehouse_id: 'w2', warehouse_name: 'La Argentina', quantity: 2 },
  { warehouse_id: 'w3', warehouse_name: 'Andes', quantity: 1 },
];
const soloW2: SaleWarehouseAccess = { restricted: true, allowedIds: ['w2'] };
const ninguna: SaleWarehouseAccess = { restricted: true, allowedIds: [] };

describe('bodegas de venta', () => {
  it('el admin no tiene restricción; los demás quedan con sus bodegas sin repetir', () => {
    expect(saleAccessFor({ isAdmin: true, warehouseIds: ['w1'] })).toEqual(UNRESTRICTED_SALE_ACCESS);
    expect(saleAccessFor({ isAdmin: false, warehouseIds: ['w1', 'w1', 'w2'] })).toEqual({
      restricted: true,
      allowedIds: ['w1', 'w2'],
    });
    expect(saleAccessFor({ isAdmin: false, warehouseIds: null })).toEqual(ninguna);
  });

  it('filtra las filas de existencias a las bodegas permitidas', () => {
    expect(filterStockRows(rows, soloW2)).toEqual([rows[1]]);
    expect(filterStockRows(rows, ninguna)).toEqual([]);
    expect(filterStockRows(rows, UNRESTRICTED_SALE_ACCESS)).toEqual(rows);
    // Sin acceso definido (orígenes remisión u OE) no se toca nada.
    expect(filterStockRows(rows, null)).toEqual(rows);
  });

  it('filtra el mapa producto → existencias', () => {
    expect(filterStockMap({ p1: rows, p2: [rows[0]] }, soloW2)).toEqual({ p1: [rows[1]], p2: [] });
    expect(filterStockMap({ p1: rows }, undefined)).toEqual({ p1: rows });
  });

  it('dice si la línea sale de una bodega permitida', () => {
    expect(itemWarehouseAllowed({ warehouse_id: 'w2' }, soloW2)).toBe(true);
    expect(itemWarehouseAllowed({ warehouse_id: 'w1' }, soloW2)).toBe(false);
    expect(itemWarehouseAllowed({ warehouse_id: '' }, soloW2)).toBe(false);
    expect(itemWarehouseAllowed({ warehouse_id: 'w1' }, UNRESTRICTED_SALE_ACCESS)).toBe(true);
    expect(hasNoSaleWarehouses(ninguna)).toBe(true);
    expect(hasNoSaleWarehouses(soloW2)).toBe(false);
    expect(hasNoSaleWarehouses(null)).toBe(false);
  });

  it('el error del guardado nombra el producto que sale de otra bodega', () => {
    const items = [
      { warehouse_id: 'w2', description: 'Nevera' },
      { warehouse_id: 'w1', description: 'Lavadora' },
    ];
    expect(saleWarehouseItemsError(items, soloW2)).toMatch(/«Lavadora».*bodegas de venta/);
    expect(saleWarehouseItemsError([items[0]], soloW2)).toBeNull();
    expect(saleWarehouseItemsError(items, UNRESTRICTED_SALE_ACCESS)).toBeNull();
    expect(saleWarehouseItemsError(items, ninguna)).toBe(SIN_BODEGAS_DE_VENTA);
  });
});
