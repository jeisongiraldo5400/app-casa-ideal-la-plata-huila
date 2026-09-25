/**
 * STUB del paquete E (descarga selectiva). El dueño de este archivo es el
 * paquete D; aquí solo está la firma EXACTA del contrato para que las órdenes
 * puedan marcarse «Llevar en el teléfono». El integrador se queda con la
 * versión de D.
 */
import { useCallback, useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { supabase } from '@/lib/supabase';

export type SyncDomain = 'clientes' | 'productos' | 'ordenes';
/** Contrato v2: productos es `todo` | `ninguno`; clientes `todo` | `seleccion`. */
export type SyncMode = 'todo' | 'seleccion' | 'ninguno';

export interface SyncDomainConfig {
  mode: SyncMode;
  revision: number;
  count: number;
  ids?: string[];
}

export interface SyncConfig {
  clientes: SyncDomainConfig;
  productos: SyncDomainConfig;
  ordenes: SyncDomainConfig;
}

type UntypedRpcClient = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>
  ) => PromiseLike<{ data: unknown; error: { message?: string } | null }>;
};

const rpc = (fn: string, args?: Record<string, unknown>) =>
  (supabase as unknown as UntypedRpcClient).rpc(fn, args);

function domainConfig(raw: unknown, fallbackMode: SyncMode): SyncDomainConfig {
  const row = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    mode: row.mode === 'seleccion' || row.mode === 'todo' || row.mode === 'ninguno' ? row.mode : fallbackMode,
    revision: Number(row.revision) || 0,
    count: Number(row.count) || 0,
    ids: Array.isArray(row.ids) ? row.ids.filter((id): id is string => typeof id === 'string') : undefined,
  };
}

export async function getSyncConfig(): Promise<SyncConfig> {
  const { data, error } = await rpc('get_mobile_sync_config');
  if (error) throw new Error(error.message || 'No se pudo leer qué llevar en el teléfono');
  const row = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  return {
    clientes: domainConfig(row.clientes, 'todo'),
    productos: domainConfig(row.productos, 'todo'),
    ordenes: domainConfig(row.ordenes, 'seleccion'),
  };
}

export async function setSyncMode(domain: SyncDomain, mode: SyncMode): Promise<void> {
  const { error } = await rpc('set_mobile_sync_mode', { p_domain: domain, p_mode: mode });
  if (error) throw new Error(error.message || 'No se pudo cambiar el modo de descarga');
  // Contrato v2: no descarga; queda pendiente hasta pulsar «Descargar».
}

export async function setSyncSelection(
  domain: SyncDomain,
  ids: string[],
  selected: boolean
): Promise<void> {
  const { error } = await rpc('set_mobile_sync_selection', {
    p_domain: domain,
    p_ids: ids,
    p_selected: selected,
  });
  if (error) throw new Error(error.message || 'No se pudo guardar la selección');
  // Contrato v2: no descarga; queda pendiente hasta pulsar «Descargar».
}

export function useOfflineSelection(domain: SyncDomain) {
  const [ids, setIds] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<SyncMode>(domain === 'ordenes' ? 'seleccion' : 'todo');
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getSyncConfig()
      .then((config) => {
        if (cancelled) return;
        setIds(new Set(config[domain].ids ?? []));
        setMode(config[domain].mode);
        setSupported(true);
      })
      .catch(() => {
        if (!cancelled) setSupported(false);
      });
    return () => {
      cancelled = true;
    };
  }, [domain]);

  const isSelected = useCallback((id: string) => ids.has(id), [ids]);

  /** Nunca lanza: si falla muestra su propia alerta y devuelve false. */
  const toggle = useCallback(
    async (id: string): Promise<boolean> => {
      const selected = !ids.has(id);
      try {
        await setSyncSelection(domain, [id], selected);
      } catch (error: unknown) {
        Alert.alert(
          'Preparar el teléfono',
          error instanceof Error && error.message ? error.message : 'No se pudo guardar la selección'
        );
        return false;
      }
      setIds((prev) => {
        const next = new Set(prev);
        if (selected) next.add(id);
        else next.delete(id);
        return next;
      });
      return true;
    },
    [domain, ids]
  );

  return { isSelected, toggle, count: ids.size, mode, supported };
}
