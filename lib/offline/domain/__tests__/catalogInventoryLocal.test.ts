import { queryLocalInventory } from '../catalogLocal';

const products = [
  { id: 'p1', name: 'Nevera Haceb', sku: 'NEV-1', barcode: '770001', status: true, categoryId: 'neveras' },
  { id: 'p2', name: 'Colchón Ortopédico', sku: 'COL-1', barcode: '770002', status: true, categoryId: 'colchones' },
  { id: 'p3', name: 'Armario', sku: 'ARM-1', barcode: null, status: true, categoryId: null },
];
const stock = [
  { productId: 'p1', warehouseId: 'w1', quantity: 2 },
  { productId: 'p1', warehouseId: 'w2', quantity: 5 },
  { productId: 'p2', warehouseId: 'w2', quantity: 0 },
];
const names = new Map([
  ['w1', 'Principal'],
  ['w2', 'La Argentina'],
]);
const base = { search: '', warehouseId: null, categoryId: null, page: 1, pageSize: 20 };

describe('queryLocalInventory', () => {
  it('sin filtros devuelve todo, por nombre, con existencias por bodega', () => {
    const result = queryLocalInventory(products, stock, names, base);
    expect(result.totalCount).toBe(3);
    expect(result.rows.map((row) => row.id)).toEqual(['p3', 'p2', 'p1']);
    const nevera = result.rows.find((row) => row.id === 'p1');
    expect(nevera?.totalStock).toBe(7);
    expect(nevera?.stock).toEqual([
      { warehouse_id: 'w2', warehouse_name: 'La Argentina', quantity: 5 },
      { warehouse_id: 'w1', warehouse_name: 'Principal', quantity: 2 },
    ]);
  });

  it('busca sin tildes por nombre, SKU o código', () => {
    expect(queryLocalInventory(products, stock, names, { ...base, search: 'colchon' }).rows.map((r) => r.id)).toEqual(['p2']);
    expect(queryLocalInventory(products, stock, names, { ...base, search: '770001' }).rows.map((r) => r.id)).toEqual(['p1']);
  });

  it('la bodega exige existencias > 0 en ella, como el servidor', () => {
    expect(queryLocalInventory(products, stock, names, { ...base, warehouseId: 'w2' }).rows.map((r) => r.id)).toEqual(['p1']);
  });

  it('filtra por categoría y pagina', () => {
    expect(queryLocalInventory(products, stock, names, { ...base, categoryId: 'neveras' }).totalCount).toBe(1);
    const page2 = queryLocalInventory(products, stock, names, { ...base, page: 2, pageSize: 2 });
    expect(page2.totalCount).toBe(3);
    expect(page2.rows.map((r) => r.id)).toEqual(['p1']);
  });
});
