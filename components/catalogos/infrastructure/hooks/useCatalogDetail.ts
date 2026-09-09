import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useAuth } from '@/components/auth/infrastructure/hooks/useAuth';
import { useCatalogAccess } from './useCatalogAccess';
import { errorMessage } from '@/lib/errorMessage';
import { isNetworkError } from '@/lib/offline/security/sessionPolicy';
import { fetchProfileNames } from '@/lib/profileNames';
import { collectSelectionIds } from '@/lib/catalogos/snapshot';
import { catalogDisplayStatus, summarizeShareLinks } from '@/lib/catalogos/shareLinks';
import type { PublicCatalogListingItem } from '@/lib/catalogos/publicCatalogTypes';
import type { PrivateCatalogDetail } from '@/lib/catalogos/types';
import { getPrivateCatalog } from '../services/catalogsService';
import { listPublicCatalogProductsByIds } from '../services/publicCatalogService';

export type ProductLookup = ReadonlyMap<string, PublicCatalogListingItem>;

export type CatalogDetailState = {
  detail: PrivateCatalogDetail | null;
  /** Fichas publicadas de los productos seleccionados, por `productId`. */
  products: ProductLookup;
  ownerName: string | null;
  loading: boolean;
  error: string | null;
  isNetworkFailure: boolean;
  notFound: boolean;
  isOwner: boolean;
  /** Puede entregar enlaces de este catálogo, sea suyo o compartido. */
  canShare: boolean;
  reload: () => Promise<void>;
  /** Actualiza el detalle en memoria (p. ej. tras guardar textos) sin refetch. */
  setDetail: (updater: (current: PrivateCatalogDetail) => PrivateCatalogDetail) => void;
};

/**
 * Carga el catálogo con sus capítulos, selección y enlaces.
 *
 * Editar sigue siendo cosa del dueño (`isOwner`), pero compartir no: en un
 * catálogo ajeno la RLS devuelve los enlaces que uno mismo entregó —nunca los
 * de un compañero, porque la etiqueta es el nombre de su cliente— y el RPC
 * acepta crear enlaces nuevos (migración 20260930120000).
 */
export function useCatalogDetail(id: string | undefined): CatalogDetailState {
  const { user } = useAuth();
  const access = useCatalogAccess();
  const [detail, setDetailState] = useState<PrivateCatalogDetail | null>(null);
  const [products, setProducts] = useState<ProductLookup>(new Map());
  const [ownerName, setOwnerName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isNetworkFailure, setIsNetworkFailure] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const reload = useCallback(async () => {
    if (!id) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const loaded = await getPrivateCatalog(id);
      if (!loaded) {
        setNotFound(true);
        setDetailState(null);
        return;
      }
      setNotFound(false);
      setDetailState(loaded);

      const { productIds } = collectSelectionIds(loaded.sections);
      const [listing, names] = await Promise.all([
        listPublicCatalogProductsByIds(productIds),
        loaded.ownerId !== user?.id ? fetchProfileNames([loaded.ownerId]) : Promise.resolve(null),
      ]);
      setProducts(new Map(listing.map((item) => [item.productId, item])));
      setOwnerName(names ? (names.get(loaded.ownerId) ?? null) : null);
    } catch (caught) {
      setError(errorMessage(caught, 'No se pudo cargar el catálogo'));
      setIsNetworkFailure(isNetworkError(caught));
    } finally {
      setLoading(false);
    }
  }, [id, user?.id]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload])
  );

  const setDetail = useCallback((updater: (current: PrivateCatalogDetail) => PrivateCatalogDetail) => {
    setDetailState((current) => (current ? updater(current) : current));
  }, []);

  const isOwner = useMemo(() => Boolean(detail && user && detail.ownerId === user.id), [detail, user]);
  // Si el detalle cargó, la RLS ya confirmó que puede verlo; lo único que falta
  // comprobar es el permiso de entregar enlaces.
  const canShare = Boolean(detail) && access.canCreateShareLink;

  return { detail, products, ownerName, loading, error, isNetworkFailure, notFound, isOwner, canShare, reload, setDetail };
}

/** Resumen de enlaces y estado visible, con un solo `now` por render. */
export function useCatalogSummary(detail: PrivateCatalogDetail | null) {
  return useMemo(() => {
    if (!detail) return null;
    const now = Date.now();
    const summary = summarizeShareLinks(detail.shareLinks, now);
    return { now, summary, displayStatus: catalogDisplayStatus({ status: detail.status, ...summary }) };
  }, [detail]);
}
