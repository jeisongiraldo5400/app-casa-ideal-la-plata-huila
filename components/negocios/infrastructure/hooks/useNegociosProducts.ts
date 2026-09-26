import { useCallback, useEffect, useRef, useState } from 'react';
import type { NegocioProductLine } from '@/lib/negocios/negocioProducts';
import { fetchNegociosProducts } from '../services/negocioProductLinesService';

type State = {
  byNegocio: Map<string, NegocioProductLine[]>;
  loading: boolean;
  error: string | null;
};

/**
 * Productos de los negocios visibles (tarjetas de Negocios, Mis negocios y
 * ficha del cliente). Una sola consulta por página: cuando la lista crece o
 * cambia (búsqueda, más filas) solo se piden los negocios que aún no se
 * tienen. `refresh` olvida lo cargado y vuelve a pedirlo (tirar para
 * actualizar).
 */
export function useNegociosProducts(negocioIds: readonly string[]): State & { refresh: () => void } {
  const key = [...new Set(negocioIds)].sort().join(',');
  const [state, setState] = useState<State>({ byNegocio: new Map(), loading: false, error: null });
  // Lo ya cargado y lo que está en camino, para no pedir dos veces lo mismo.
  const cache = useRef(new Map<string, NegocioProductLine[]>());
  const inFlight = useRef(new Set<string>());
  // Cambia con `refresh`: las respuestas de antes se descartan.
  const [generation, setGeneration] = useState(0);
  const generationRef = useRef(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    const ids = key ? key.split(',') : [];
    const missing = ids.filter((id) => !cache.current.has(id) && !inFlight.current.has(id));
    if (missing.length === 0) return;
    missing.forEach((id) => inFlight.current.add(id));
    const requestGeneration = generationRef.current;
    setState((current) => ({ ...current, loading: true, error: null }));
    fetchNegociosProducts(missing)
      .then((result) => {
        if (!mounted.current || requestGeneration !== generationRef.current) return;
        // Un negocio sin filas queda en caché vacío: no se vuelve a pedir.
        missing.forEach((id) => cache.current.set(id, result.get(id) ?? []));
        missing.forEach((id) => inFlight.current.delete(id));
        setState({
          byNegocio: new Map(cache.current),
          loading: inFlight.current.size > 0,
          error: null,
        });
      })
      .catch(() => {
        if (!mounted.current || requestGeneration !== generationRef.current) return;
        missing.forEach((id) => inFlight.current.delete(id));
        setState((current) => ({
          ...current,
          loading: inFlight.current.size > 0,
          error: 'No se pudieron cargar los productos.',
        }));
      });
  }, [key, generation]);

  const refresh = useCallback(() => {
    cache.current = new Map();
    inFlight.current = new Set();
    generationRef.current += 1;
    // Lo que ya se ve se mantiene hasta que llegue la respuesta nueva.
    setGeneration(generationRef.current);
  }, []);

  return { ...state, refresh };
}
