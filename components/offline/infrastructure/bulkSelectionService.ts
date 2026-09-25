/**
 * Selección masiva de «Qué llevar en el teléfono»: resuelve en el servidor los
 * ids de un criterio (mis clientes, por vendedor, por municipio o vereda; por
 * categoría o bodega) para marcarlos de una vez con `setSyncSelection`.
 *
 * Se consulta el servidor y no la base local: en modo «Solo lo que elijo» el
 * teléfono no tiene precisamente lo que se quiere marcar.
 */
import { supabase } from '@/lib/supabase';
import { SELECTION_LIMITS } from './syncPrefsService';

export type CustomerCriteria = {
  sellerId?: string | null;
  municipioId?: string | null;
  veredaId?: string | null;
};

export type ProductCriteria = {
  categoryId?: string | null;
  warehouseId?: string | null;
};

export type BulkCandidates = {
  ids: string[];
  /** Total en el servidor; puede superar a `ids.length` si pasa del tope. */
  total: number;
};

export type NamedOption = { id: string; name: string };

export async function fetchCustomerCandidates(criteria: CustomerCriteria): Promise<BulkCandidates> {
  if (!criteria.sellerId && !criteria.municipioId && !criteria.veredaId) {
    return { ids: [], total: 0 };
  }
  let query = supabase
    .from('customers')
    .select('id', { count: 'exact' })
    .is('deleted_at', null);
  if (criteria.sellerId) query = query.eq('seller_id', criteria.sellerId);
  if (criteria.veredaId) query = query.eq('vereda_id', criteria.veredaId);
  else if (criteria.municipioId) query = query.eq('municipio_id', criteria.municipioId);
  const { data, error, count } = await query.order('name').limit(SELECTION_LIMITS.clientes);
  if (error) throw new Error(error.message || 'No se pudieron contar los clientes');
  const ids = (data || []).map((row) => row.id);
  return { ids, total: count ?? ids.length };
}

export async function fetchProductCandidates(criteria: ProductCriteria): Promise<BulkCandidates> {
  if (criteria.warehouseId) {
    // Productos con existencias en la bodega: los que sirven para vender desde allí.
    const { data, error } = await supabase
      .from('warehouse_stock')
      .select('product_id')
      .eq('warehouse_id', criteria.warehouseId)
      .gt('quantity', 0)
      .limit(5000);
    if (error) throw new Error(error.message || 'No se pudieron contar los productos');
    const all = Array.from(new Set((data || []).map((row) => row.product_id)));
    return { ids: all.slice(0, SELECTION_LIMITS.productos), total: all.length };
  }
  if (criteria.categoryId) {
    const { data, error, count } = await supabase
      .from('products')
      .select('id', { count: 'exact' })
      .eq('category_id', criteria.categoryId)
      .is('deleted_at', null)
      .order('name')
      .limit(SELECTION_LIMITS.productos);
    if (error) throw new Error(error.message || 'No se pudieron contar los productos');
    const ids = (data || []).map((row) => row.id);
    return { ids, total: count ?? ids.length };
  }
  return { ids: [], total: 0 };
}

export async function fetchCategoryOptions(): Promise<NamedOption[]> {
  const { data, error } = await supabase
    .from('category')
    .select('id, name')
    .is('deleted_at', null)
    .order('name');
  if (error) throw new Error(error.message || 'No se pudieron cargar las categorías');
  return (data || []).map((row) => ({ id: row.id, name: row.name || 'Sin nombre' }));
}

export async function fetchWarehouseOptions(): Promise<NamedOption[]> {
  const { data, error } = await supabase
    .from('warehouses')
    .select('id, name')
    .eq('is_active', true)
    .order('name');
  if (error) throw new Error(error.message || 'No se pudieron cargar las bodegas');
  return (data || []).map((row) => ({ id: row.id, name: row.name || 'Sin nombre' }));
}
