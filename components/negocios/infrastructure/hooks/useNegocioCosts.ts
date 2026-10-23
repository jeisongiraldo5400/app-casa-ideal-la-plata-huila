import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  parseNegocioCostResult,
  type NegocioCostResult,
} from '@/lib/negocios/negocioCosts';

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
