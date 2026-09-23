import { Q } from '@nozbe/watermelondb';
import { getDatabase, isDatabaseOpen } from '../database';
import {
  CatalogDepartamento,
  CatalogMunicipio,
  CatalogProduct,
  CatalogVereda,
  CatalogWarehouse,
  CatalogWarehouseStock,
  CreditSettingsRecord,
} from '../models';
import {
  filterCatalogProducts,
  stockRowsForProduct,
  type LocalCatalogProduct,
} from '../domain/catalogLocal';
import { getCatalogPulledAt } from '../sync/catalogPull';

/**
 * Lecturas del catálogo descargado (productos, bodegas, existencias) y de los
 * catálogos que el asistente de negocio necesita para funcionar sin señal.
 *
 * Todo lo que sale de aquí es «lo de la última descarga»: las pantallas lo
 * dicen así, sobre todo las existencias.
 */

export type LocalStockRow = {
  warehouse_id: string;
  warehouse_name: string;
  quantity: number;
};

export function canUseLocalCatalog() {
  return isDatabaseOpen();
}

async function allProducts(): Promise<LocalCatalogProduct[]> {
  const rows = await getDatabase().get<CatalogProduct>('catalog_products').query().fetch();
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    sku: row.sku,
    barcode: row.barcode,
    status: row.status,
  }));
}

/** ¿Hay catálogo descargado? Sin él, el asistente no puede armar el negocio. */
export async function hasLocalCatalog(): Promise<boolean> {
  if (!canUseLocalCatalog()) return false;
  const count = await getDatabase().get<CatalogProduct>('catalog_products').query().fetchCount();
  return count > 0;
}

/** Momento de la última descarga del catálogo; null si nunca se bajó. */
export async function localCatalogPulledAt(): Promise<number | null> {
  if (!canUseLocalCatalog()) return null;
  return getCatalogPulledAt(getDatabase());
}

export async function searchCatalogProductsFromLocal(term: string, limit = 20) {
  if (!canUseLocalCatalog()) return [];
  return filterCatalogProducts(await allProducts(), term, limit);
}

export async function findCatalogProductByBarcodeFromLocal(barcode: string) {
  if (!canUseLocalCatalog()) return null;
  const normalized = barcode.trim();
  if (!normalized) return null;
  const rows = await getDatabase()
    .get<CatalogProduct>('catalog_products')
    .query(Q.where('barcode', normalized))
    .fetch();
  const found = rows.find((row) => row.status !== false);
  return found
    ? { id: found.id, name: found.name, sku: found.sku, barcode: found.barcode, status: found.status }
    : null;
}

async function warehouseNames(): Promise<Map<string, string>> {
  const rows = await getDatabase().get<CatalogWarehouse>('catalog_warehouses').query().fetch();
  return new Map(rows.map((row) => [row.id, row.name]));
}

/** Existencias de la última descarga, por producto y bodega. */
export async function stockForProductsFromLocal(
  productIds: string[]
): Promise<Record<string, LocalStockRow[]>> {
  if (!canUseLocalCatalog()) return {};
  const unique = [...new Set(productIds.filter(Boolean))];
  if (!unique.length) return {};
  const database = getDatabase();
  const [stock, names] = await Promise.all([
    database
      .get<CatalogWarehouseStock>('catalog_warehouse_stock')
      .query(Q.where('product_id', Q.oneOf(unique)))
      .fetch(),
    warehouseNames(),
  ]);
  const rows = stock.map((row) => ({
    productId: row.productId,
    warehouseId: row.warehouseId,
    quantity: Number(row.quantity) || 0,
  }));
  return Object.fromEntries(
    unique.map((productId) => [productId, stockRowsForProduct(rows, names, productId)])
  );
}

export async function stockForProductFromLocal(productId: string): Promise<LocalStockRow[]> {
  const map = await stockForProductsFromLocal([productId]);
  return map[productId] || [];
}

/**
 * Configuración de crédito de la última descarga. La guarda el paquete de
 * sincronización (tabla local `credit_settings`, una sola fila activa).
 */
export async function fetchCreditSettingsFromLocal() {
  if (!canUseLocalCatalog()) return null;
  const rows = await getDatabase()
    .get<CreditSettingsRecord>('credit_settings')
    .query()
    .fetch();
  const active = rows.find((row) => row.isActive !== false) || rows[0];
  if (!active) return null;
  return {
    formula_type: active.formulaType,
    interest_rate_monthly_pct: Number(active.interestRateMonthlyPct),
    rounding_unit: Number(active.roundingUnit),
    late_fee_rate_pct: Number(active.lateFeeRatePct),
    money_decimal_places: Number(active.moneyDecimalPlaces),
    min_installments: Number(active.minInstallments),
    max_installments: Number(active.maxInstallments),
    default_frequency: active.defaultFrequency,
    legal_text: active.legalText,
  };
}

export type LocalLocationCatalogs = {
  departamentos: { id: string; nombre: string }[];
  municipios: { id: string; nombre: string; departamento_id: string }[];
  veredas: { id: string; nombre: string; municipio_id: string }[];
};

/** Departamentos, municipios y veredas descargados (activos). */
export async function fetchLocationCatalogsFromLocal(): Promise<LocalLocationCatalogs> {
  if (!canUseLocalCatalog()) return { departamentos: [], municipios: [], veredas: [] };
  const database = getDatabase();
  const [departamentos, municipios, veredas] = await Promise.all([
    database.get<CatalogDepartamento>('catalog_departamentos').query().fetch(),
    database.get<CatalogMunicipio>('catalog_municipios').query().fetch(),
    database.get<CatalogVereda>('catalog_veredas').query().fetch(),
  ]);
  const byName = (a: { nombre: string }, b: { nombre: string }) =>
    (a.nombre || '').localeCompare(b.nombre || '');
  return {
    departamentos: departamentos
      .filter((row) => row.isActive !== false)
      .map((row) => ({ id: row.id, nombre: row.nombre }))
      .sort(byName),
    municipios: municipios
      .filter((row) => row.isActive !== false)
      .map((row) => ({
        id: row.id,
        nombre: row.nombre,
        departamento_id: row.departamentoId || '',
      }))
      .sort(byName),
    veredas: veredas
      .filter((row) => row.isActive !== false)
      .map((row) => ({ id: row.id, nombre: row.nombre, municipio_id: row.municipioId }))
      .sort(byName),
  };
}
