import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  buildCostPreviewItems,
  costPreviewKey,
  parseNegocioCostResult,
  type NegocioCostResult,
} from '@/lib/negocios/negocioCosts';

/** Espera tras el último cambio de precio o cantidad antes de pedir la vista previa. */
export const COST_PREVIEW_DEBOUNCE_MS = 600;

/*
 * Costos del perfil «costos» (20261231620000). El resultado vive solo en la
 * memoria de la pantalla: no se guarda en SQLite ni en stores persistidos.
 * Sin conexión, sin el perfil o si el servidor falla, devuelve null y la
 * pantalla no muestra nada.
 */

async function rpcCosts(fn: 'cost_preview_lines' | 'cost_get_negocio', args: Record<string, unknown>) {
  const { data, error } = await (supabase.rpc as unknown as (
    name: string,
    params: Record<string, unknown>
  ) => PromiseLike<{ data: unknown; error: unknown }>)(fn, args);
  if (error) return null;
  return parseNegocioCostResult(data);
}

/** Vista previa al crear el negocio (líneas sin guardar). */
export function useNegocioCostPreview(
  items: readonly { product_id: string; quantity: number; unit_price: number }[],
  enabled: boolean
): NegocioCostResult | null {
  const previewItems = useMemo(() => buildCostPreviewItems(items), [items]);
  const key = costPreviewKey(previewItems);
  const [result, setResult] = useState<{ key: string; value: NegocioCostResult | null } | null>(null);

  useEffect(() => {
    if (!enabled || !previewItems.length) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      rpcCosts('cost_preview_lines', { p_items: previewItems })
        .then((value) => {
          if (!cancelled) setResult({ key, value });
        })
        .catch(() => {
          if (!cancelled) setResult({ key, value: null });
        });
    }, COST_PREVIEW_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // `key` resume previewItems.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, key]);

  if (!enabled || !previewItems.length || !result || result.key !== key) return null;
  return result.value;
}

/** Costo y margen de un negocio guardado (foto al activar, o costo vigente si es borrador). */
export function useNegocioCostDetail(negocioId: string | null | undefined, enabled: boolean, refreshKey?: unknown) {
  const [result, setResult] = useState<{ id: string; value: NegocioCostResult | null } | null>(null);

  useEffect(() => {
    if (!enabled || !negocioId) return;
    let cancelled = false;
    rpcCosts('cost_get_negocio', { p_negocio_id: negocioId })
      .then((value) => {
        if (!cancelled) setResult({ id: negocioId, value });
      })
      .catch(() => {
        if (!cancelled) setResult({ id: negocioId, value: null });
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, negocioId, refreshKey]);

  if (!enabled || !negocioId || !result || result.id !== negocioId) return null;
  return result.value;
}
