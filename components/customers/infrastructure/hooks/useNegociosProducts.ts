import { useEffect, useState } from 'react';
import type { NegocioProductLine } from '@/lib/customers/negocioProducts';
import { fetchNegociosProducts } from '../services/customerNegocioProductsService';

type State = {
  byNegocio: Map<string, NegocioProductLine[]>;
  loading: boolean;
  error: string | null;
};

/** Carga los productos de los negocios visibles en la ficha del cliente. */
export function useNegociosProducts(negocioIds: readonly string[]): State {
  const key = [...negocioIds].sort().join(',');
  const [state, setState] = useState<State>({ byNegocio: new Map(), loading: false, error: null });

  useEffect(() => {
    const ids = key ? key.split(',') : [];
    if (ids.length === 0) {
      setState({ byNegocio: new Map(), loading: false, error: null });
      return;
    }
    let cancelled = false;
    setState((current) => ({ ...current, loading: true, error: null }));
    fetchNegociosProducts(ids)
      .then((byNegocio) => {
        if (!cancelled) setState({ byNegocio, loading: false, error: null });
      })
      .catch(() => {
        if (!cancelled) setState({ byNegocio: new Map(), loading: false, error: 'No se pudieron cargar los productos.' });
      });
    return () => {
      cancelled = true;
    };
  }, [key]);

  return state;
}
