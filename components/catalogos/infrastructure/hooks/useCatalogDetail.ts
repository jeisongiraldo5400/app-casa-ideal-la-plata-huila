import { useCallback, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useAuth } from '@/components/auth/infrastructure/hooks/useAuth';
import { useCatalogAccess } from './useCatalogAccess';
import { errorMessage } from '@/lib/errorMessage';
import { isNetworkError } from '@/lib/offline/security/sessionPolicy';
import { catalogDisplayStatus, summarizeShareLinks } from '@/lib/catalogos/shareLinks';
import type { PublicCatalogListingItem } from '@/lib/catalogos/publicCatalogTypes';
import type { CategoryPreview } from '@/lib/catalogos/sectionCounts';
import type { PrivateCatalogDetail } from '@/lib/catalogos/types';
import { useCatalogosStore } from '../store/catalogosStore';

export type ProductLookup = ReadonlyMap<string, PublicCatalogListingItem>;
export type CategoryPreviewLookup = ReadonlyMap<string, CategoryPreview>;

const EMPTY_PRODUCTS: ProductLookup = new Map();
const EMPTY_CATEGORIES: CategoryPreviewLookup = new Map();

export type CatalogDetailState = {
  detail: PrivateCatalogDetail | null;
  /** Fichas publicadas de los productos sueltos, por `productId`. */
  products: ProductLookup;
  /** Muestra y total de fichas de cada categoría completa, por `categoryId`. */
  categories: CategoryPreviewLookup;
  ownerName: string | null;
  loading: boolean;
  error: string | null;
  isNetworkFailure: boolean;
  notFound: boolean;
  isOwner: boolean;
  /** Puede entregar enlaces de este catálogo, sea suyo o compartido. */
  canShare: boolean;
  /** Recarga ignorando la caché. */
  reload: () => Promise<void>;
  /** Actualiza el detalle en memoria (p. ej. tras guardar textos) sin refetch. */
  setDetail: (updater: (current: PrivateCatalogDetail) => PrivateCatalogDetail) => void;
};

/**
 * Catálogo con sus categorías, productos y enlaces, desde la caché compartida
 * del store: al volver a la pantalla solo se recarga si pasaron más de 30 s
 * o si hubo una mutación (`invalidateCatalog`).
 *
 * Editar sigue siendo cosa del dueño (`isOwner`), pero compartir no: en un
 * catálogo ajeno la RLS devuelve los enlaces que uno mismo entregó —nunca los
 * de un compañero, porque la etiqueta es el nombre de su cliente— y el RPC
 * acepta crear enlaces nuevos (migración 20260930120000).
 */
export function useCatalogDetail(id: string | undefined): CatalogDetailState {
  const { user } = useAuth();
  const viewerId = user?.id ?? null;
  const access = useCatalogAccess();
  const entry = useCatalogosStore((state) => (id ? state.details[id] : undefined));
  const loadDetail = useCatalogosStore((state) => state.loadDetail);
  const patchDetail = useCatalogosStore((state) => state.patchDetail);
  const [loading, setLoading] = useState(!entry);
  const [error, setError] = useState<string | null>(null);
  const [isNetworkFailure, setIsNetworkFailure] = useState(false);
  const [notFound, setNotFound] = useState(false);
  // Una respuesta que llega con la pantalla ya fuera de foco no toca su estado.
  const focused = useRef(true);

  const load = useCallback(
    async (force: boolean) => {
      if (!id) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      setIsNetworkFailure(false);
      try {
        const loaded = await loadDetail(id, viewerId, { force });
        if (!focused.current) return;
        setNotFound(loaded === null);
      } catch (caught) {
        if (!focused.current) return;
        setError(errorMessage(caught, 'No se pudo cargar el catálogo'));
        setIsNetworkFailure(isNetworkError(caught));
      } finally {
        if (focused.current) setLoading(false);
      }
    },
    [id, viewerId, loadDetail]
  );

  const reload = useCallback(() => load(true), [load]);

  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      void load(false);
      return () => {
        focused.current = false;
      };
    }, [load])
  );

  const setDetail = useCallback(
    (updater: (current: PrivateCatalogDetail) => PrivateCatalogDetail) => {
      if (id) patchDetail(id, updater);
    },
    [id, patchDetail]
  );

  const detail = notFound ? null : (entry?.detail ?? null);
  const isOwner = useMemo(() => Boolean(detail && viewerId && detail.ownerId === viewerId), [detail, viewerId]);
  // Si el detalle cargó, la RLS ya confirmó que puede verlo; lo único que falta
  // comprobar es el permiso de entregar enlaces.
  const canShare = Boolean(detail) && access.canCreateShareLink;

  return {
    detail,
    products: entry?.products ?? EMPTY_PRODUCTS,
    categories: entry?.categories ?? EMPTY_CATEGORIES,
    ownerName: entry?.ownerName ?? null,
    loading,
    error,
    isNetworkFailure,
    notFound,
    isOwner,
    canShare,
    reload,
    setDetail,
  };
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
