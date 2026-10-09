/**
 * Bodegas de venta (3.5.0) en la búsqueda de productos y las existencias del
 * asistente de negocio: con acceso restringido solo aparecen las bodegas
 * permitidas, con señal y sin ella.
 */
const mockBuilder: Record<string, jest.Mock> = {};
const mockFrom = jest.fn((_table: string) => mockBuilder);
let mockNetworkError = false;

jest.mock('@/lib/supabase', () => ({
  supabase: { from: (table: string) => mockFrom(table) },
}));

jest.mock('@/lib/offline/security/sessionPolicy', () => ({
  isNetworkError: jest.fn(() => mockNetworkError),
}));

jest.mock('@/lib/offline/repositories/catalogRepository', () => ({
  canUseLocalCatalog: jest.fn(() => true),
  hasLocalCatalog: jest.fn(async () => true),
  catalogProductIdsWithStockInFromLocal: jest.fn(async () => new Set(['p1'])),
  findCatalogProductByBarcodeFromLocal: jest.fn(async () => ({
    id: 'p2', name: 'Lavadora', sku: null, barcode: '880', status: true,
  })),
  searchCatalogProductsFromLocal: jest.fn(async () => []),
  searchCatalogProductsInWarehousesFromLocal: jest.fn(async () => [
    { id: 'p1', name: 'Nevera', sku: 'NEV-1', barcode: null, status: true },
  ]),
  stockForProductFromLocal: jest.fn(async () => [
    { warehouse_id: 'w1', warehouse_name: 'Principal', quantity: 3 },
    { warehouse_id: 'w2', warehouse_name: 'Andes', quantity: 1 },
  ]),
  stockForProductsFromLocal: jest.fn(async () => ({
    p1: [
      { warehouse_id: 'w1', warehouse_name: 'Principal', quantity: 3 },
      { warehouse_id: 'w2', warehouse_name: 'Andes', quantity: 1 },
    ],
  })),
}));

import {
  searchCatalogProductsFromLocal,
  searchCatalogProductsInWarehousesFromLocal,
} from '@/lib/offline/repositories/catalogRepository';
import type { SaleWarehouseAccess } from '../../../domain/saleWarehouses';
import { findActiveProductByBarcode, searchProductsForNegocio } from '../negociosProductsService';
import {
  fetchProductWarehouseStock,
  fetchStockForProductsWithSource,
} from '../negociosStockService';

const soloW2: SaleWarehouseAccess = { restricted: true, allowedIds: ['w2'] };
const ninguna: SaleWarehouseAccess = { restricted: true, allowedIds: [] };

const stockRows = [
  { warehouse_id: 'w1', quantity: 3, warehouse: { name: 'Principal' } },
  { warehouse_id: 'w2', quantity: 1, warehouse: { name: 'Andes' } },
];

beforeEach(() => {
  jest.clearAllMocks();
  mockNetworkError = false;
  for (const key of Object.keys(mockBuilder)) delete mockBuilder[key];
  for (const method of ['select', 'is', 'eq', 'or', 'in', 'gt']) {
    mockBuilder[method] = jest.fn(() => mockBuilder);
  }
  mockBuilder.order = jest.fn(() => mockBuilder);
  mockBuilder.limit = jest.fn(async () => ({
    data: [
      { id: 'p1', name: 'Nevera', sku: 'NEV-1', barcode: '770', warehouse_stock: [{ warehouse_id: 'w2', quantity: 1 }] },
      { id: 'p1', name: 'Nevera', sku: 'NEV-1', barcode: '770', warehouse_stock: [{ warehouse_id: 'w2', quantity: 1 }] },
    ],
    error: null,
  }));
  mockBuilder.maybeSingle = jest.fn(async () => ({
    data: { id: 'p1', name: 'Nevera', sku: 'NEV-1', barcode: '770', warehouse_stock: [] },
    error: null,
  }));
});

describe('búsqueda de productos con bodegas de venta', () => {
  it('restringido: une con warehouse_stock de sus bodegas con stock y desduplica', async () => {
    await expect(searchProductsForNegocio('nevera', soloW2)).resolves.toEqual([
      { id: 'p1', name: 'Nevera', sku: 'NEV-1', barcode: '770' },
    ]);
    expect(mockBuilder.select).toHaveBeenCalledWith(
      'id, name, sku, barcode, warehouse_stock!inner(warehouse_id, quantity)'
    );
    expect(mockBuilder.in).toHaveBeenCalledWith('warehouse_stock.warehouse_id', ['w2']);
    expect(mockBuilder.gt).toHaveBeenCalledWith('warehouse_stock.quantity', 0);
  });

  it('sin restricción la consulta es la de siempre', async () => {
    await searchProductsForNegocio('nevera', { restricted: false });
    expect(mockBuilder.select).toHaveBeenCalledWith('id, name, sku, barcode');
    expect(mockBuilder.in).not.toHaveBeenCalled();
  });

  it('sin bodegas asignadas no consulta y no encuentra nada', async () => {
    await expect(searchProductsForNegocio('nevera', ninguna)).resolves.toEqual([]);
    await expect(findActiveProductByBarcode('770', ninguna)).resolves.toBeNull();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('sin señal busca en el catálogo local limitado a sus bodegas', async () => {
    mockNetworkError = true;
    mockBuilder.limit.mockRejectedValueOnce(new Error('Network request failed'));
    await expect(searchProductsForNegocio('nevera', soloW2)).resolves.toEqual([
      { id: 'p1', name: 'Nevera', sku: 'NEV-1', barcode: '' },
    ]);
    expect(searchCatalogProductsInWarehousesFromLocal).toHaveBeenCalledWith('nevera', ['w2'], 20);
    expect(searchCatalogProductsFromLocal).not.toHaveBeenCalled();
  });

  it('el código escaneado sin stock en sus bodegas (sin señal) no se encuentra', async () => {
    mockNetworkError = true;
    mockBuilder.maybeSingle.mockRejectedValueOnce(new Error('Network request failed'));
    await expect(findActiveProductByBarcode('880', soloW2)).resolves.toBeNull();
  });

  it('el código escaneado con señal usa el mismo JOIN', async () => {
    await expect(findActiveProductByBarcode('770', soloW2)).resolves.toEqual({
      id: 'p1', name: 'Nevera', sku: 'NEV-1', barcode: '770',
    });
    expect(mockBuilder.in).toHaveBeenCalledWith('warehouse_stock.warehouse_id', ['w2']);
  });
});

describe('existencias con bodegas de venta', () => {
  beforeEach(() => {
    mockBuilder.order = jest.fn(async () => ({ data: stockRows, error: null }));
  });

  it('un producto: solo las bodegas permitidas', async () => {
    await expect(fetchProductWarehouseStock('p1', soloW2)).resolves.toEqual([
      { warehouse_id: 'w2', warehouse_name: 'Andes', quantity: 1 },
    ]);
    await expect(fetchProductWarehouseStock('p1')).resolves.toHaveLength(2);
  });

  it('varios productos: el mapa llega filtrado', async () => {
    await expect(fetchStockForProductsWithSource(['p1'], soloW2)).resolves.toEqual({
      stock: { p1: [{ warehouse_id: 'w2', warehouse_name: 'Andes', quantity: 1 }] },
      fromLocal: false,
    });
  });

  it('sin bodegas asignadas todo queda sin existencias y no se consulta', async () => {
    await expect(fetchProductWarehouseStock('p1', ninguna)).resolves.toEqual([]);
    await expect(fetchStockForProductsWithSource(['p1'], ninguna)).resolves.toEqual({
      stock: { p1: [] },
      fromLocal: false,
    });
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('sin señal filtra también las existencias de la última descarga', async () => {
    mockNetworkError = true;
    mockBuilder.order = jest.fn(async () => {
      throw new Error('Network request failed');
    });
    await expect(fetchProductWarehouseStock('p1', soloW2)).resolves.toEqual([
      { warehouse_id: 'w2', warehouse_name: 'Andes', quantity: 1 },
    ]);
    await expect(fetchStockForProductsWithSource(['p1'], soloW2)).resolves.toEqual({
      stock: { p1: [{ warehouse_id: 'w2', warehouse_name: 'Andes', quantity: 1 }] },
      fromLocal: true,
    });
  });
});
