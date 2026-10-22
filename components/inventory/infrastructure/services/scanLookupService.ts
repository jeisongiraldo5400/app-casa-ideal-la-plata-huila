import { supabase } from '@/lib/supabase';
import { isNetworkError } from '@/lib/offline/security/sessionPolicy';
import { useSyncStore } from '@/lib/offline/store/syncStore';
import {
  findCatalogProductByBarcodeFromLocal,
  hasLocalCatalog,
} from '@/lib/offline/repositories/catalogRepository';

/**
 * Resultado de buscar un código escaneado en «Buscar producto».
 * - `found`: existe (en el servidor o, sin señal, en lo descargado).
 * - `missing`: no existe (o, sin señal, no vino en la última descarga).
 * - `error`: no se pudo consultar; `error` trae la causa para el aviso.
 */
export type ScanLookupResult =
  | { status: 'found'; fromLocal: boolean }
  | { status: 'missing'; fromLocal: boolean }
  | { status: 'error'; error: unknown };

async function lookupLocal(barcode: string): Promise<ScanLookupResult | null> {
  if (!(await hasLocalCatalog().catch(() => false))) return null;
  const product = await findCatalogProductByBarcodeFromLocal(barcode).catch(() => null);
  return { status: product ? 'found' : 'missing', fromLocal: true };
}

/**
 * Busca el producto por código. Sin señal (o si la petición no llega) mira el
 * catálogo descargado: antes el escaneo sin señal siempre terminaba en «Sin
 * conexión» aunque el producto estuviera en el teléfono.
 */
export async function lookupScannedBarcode(barcode: string): Promise<ScanLookupResult> {
  if (!useSyncStore.getState().online) {
    const local = await lookupLocal(barcode);
    if (local) return local;
  }
  try {
    const { data, error } = await supabase
      .from('products')
      .select('id')
      .eq('barcode', barcode)
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return { status: data ? 'found' : 'missing', fromLocal: false };
  } catch (error) {
    if (isNetworkError(error)) {
      const local = await lookupLocal(barcode);
      if (local) return local;
    }
    return { status: 'error', error };
  }
}
