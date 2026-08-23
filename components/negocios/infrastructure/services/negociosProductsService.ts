import { supabase } from '@/lib/supabase';

export type NegocioProduct = {
  id: string;
  name: string;
  sku: string;
  barcode: string;
  sale_price: number;
};

const PRODUCT_FIELDS = 'id, name, sku, barcode, sale_price';

function safeSearchTerm(value: string) {
  return value.trim().replace(/[,()%_'"\\]/g, ' ').replace(/\s+/g, ' ');
}

export async function searchProductsForNegocio(query: string): Promise<NegocioProduct[]> {
  const term = safeSearchTerm(query);
  if (!term) return [];

  const { data, error } = await supabase
    .from('products')
    .select(PRODUCT_FIELDS)
    .is('deleted_at', null)
    .eq('status', true)
    .or(`name.ilike.%${term}%,sku.ilike.%${term}%,barcode.ilike.%${term}%`)
    .order('name')
    .limit(20);

  if (error) throw new Error(`No fue posible buscar productos: ${error.message}`);
  return (data || []) as NegocioProduct[];
}

export async function findActiveProductByBarcode(
  barcode: string
): Promise<NegocioProduct | null> {
  const normalized = barcode.trim();
  if (!normalized) return null;

  const { data, error } = await supabase
    .from('products')
    .select(PRODUCT_FIELDS)
    .eq('barcode', normalized)
    .is('deleted_at', null)
    .eq('status', true)
    .maybeSingle();

  if (error) throw new Error(`No fue posible buscar el código: ${error.message}`);
  return (data as NegocioProduct | null) || null;
}
