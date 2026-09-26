import { useEffect, useState } from 'react';
import { fetchUltimaGestion } from '@/lib/collection-routes/ultimaGestionService';
import type { UltimaGestion } from '@/lib/collection-routes/ultimaGestion';

const EMPTY = new Map<string, UltimaGestion>();

/**
 * Última novedad de ruta de los negocios que se ven en pantalla (una sola
 * consulta por lista). Un fallo deja el mapa vacío: es un dato de apoyo.
 */
export function useUltimaGestion(negocioIds: string[], online: boolean, reloadKey?: unknown) {
  const [byNegocio, setByNegocio] = useState<Map<string, UltimaGestion>>(EMPTY);
  const key = Array.from(new Set(negocioIds)).sort().join(',');

  useEffect(() => {
    if (!key) {
      setByNegocio(EMPTY);
      return;
    }
    let alive = true;
    void fetchUltimaGestion(key.split(','), online)
      .then((result) => {
        if (alive) setByNegocio(result);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [key, online, reloadKey]);

  return byNegocio;
}
