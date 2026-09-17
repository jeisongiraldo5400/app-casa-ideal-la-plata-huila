import { create } from 'zustand';
import { errorMessage } from '@/lib/errorMessage';
import { needsRefresh, type CacheStamp } from '@/lib/catalogos/cacheFreshness';
import type { PrivateCatalogDetail, PrivateCatalogListItem } from '@/lib/catalogos/types';
import { currentUserId, listPrivateCatalogs } from '../services/catalogsService';
import { loadCatalogDetailBundle, type CatalogDetailBundle } from '../services/catalogDetailService';

export type CatalogDetailEntry = CatalogDetailBundle & CacheStamp;

interface CatalogosState {
  list: PrivateCatalogListItem[];
  listStamp: CacheStamp | null;
  loading: boolean;
  /** Mensaje del último fallo de `fetchList`; null cuando la carga fue exitosa. */
  error: string | null;
  /** Carga la lista. Sin `force`, solo si no hay datos, pasaron 30 s o hubo una mutación. */
  fetchList: (options?: { force?: boolean }) => Promise<void>;
  /** Quita un catálogo recién archivado sin esperar la recarga. */
  removeFromList: (id: string) => void;

  /** Detalle por id, compartido entre Detalle, Productos y Compartir. */
  details: Record<string, CatalogDetailEntry>;
  /**
   * Carga (o reutiliza) el detalle. Devuelve `null` si el catálogo no existe
   * o no es visible; lanza si falla la red.
   */
  loadDetail: (id: string, viewerId: string | null, options?: { force?: boolean }) => Promise<CatalogDetailEntry | null>;
  /** Cambia el detalle en memoria (p. ej. tras guardar textos) sin refetch. */
  patchDetail: (id: string, updater: (current: PrivateCatalogDetail) => PrivateCatalogDetail) => void;
  /** Marca el detalle y la lista para recargar la próxima vez que se muestren. */
  invalidateCatalog: (id: string) => void;
}

/** Cargas en curso por id: dos pantallas que enfocan a la vez comparten la petición. */
const inflightDetails = new Map<string, Promise<CatalogDetailEntry | null>>();
/** Última carga lanzada por id: una respuesta vieja nunca pisa a una forzada más nueva. */
const detailSequence = new Map<string, number>();

/** Carga de la lista en curso: los enfoques simultáneos la comparten. */
let inflightList: Promise<void> | null = null;
/** Última carga de la lista lanzada: una respuesta vieja no pisa a una más nueva. */
let listSequence = 0;
/** Cuenta las mutaciones: si alguna llega durante la carga, la lista queda marcada para recargar. */
let listInvalidations = 0;
/**
 * Archivados en esta sesión. Una carga lanzada antes de archivar todavía los
 * trae; se filtran para que no reaparezcan (en la app no se desarchiva).
 */
const archivedIds = new Set<string>();

/**
 * Lista y detalle viven aquí como caché de sesión (30 s o hasta una
 * mutación). El I/O está en los services; las pantallas deciden cuándo
 * pedir con `fetchList` / `loadDetail`.
 */
export const useCatalogosStore = create<CatalogosState>((set, get) => ({
  list: [],
  listStamp: null,
  loading: false,
  error: null,
  details: {},

  fetchList: async ({ force = false } = {}) => {
    if (!force && inflightList) return inflightList;
    if (!force && !needsRefresh(get().listStamp, Date.now())) return;

    const sequence = (listSequence += 1);
    const invalidationsAtStart = listInvalidations;
    const isLatest = () => listSequence === sequence;
    set({ loading: true, error: null });

    const request = (async () => {
      try {
        const viewerId = await currentUserId();
        const list = await listPrivateCatalogs(viewerId);
        if (!isLatest()) return;
        set({
          list: list.filter((item) => !archivedIds.has(item.id)),
          error: null,
          // Una mutación durante la carga deja la lista para recargar al volver.
          listStamp: { loadedAt: Date.now(), stale: listInvalidations !== invalidationsAtStart },
        });
      } catch (error) {
        if (!isLatest()) return;
        // Se conserva la lista anterior: un fallo de red no debe vaciar la pantalla.
        set({ error: errorMessage(error, 'No se pudieron cargar los catálogos') });
      } finally {
        if (isLatest()) {
          inflightList = null;
          set({ loading: false });
        }
      }
    })();
    inflightList = request;
    return request;
  },

  removeFromList: (id) => {
    archivedIds.add(id);
    listInvalidations += 1;
    set((state) => {
      const details = { ...state.details };
      delete details[id];
      return { list: state.list.filter((item) => item.id !== id), details };
    });
  },

  loadDetail: async (id, viewerId, { force = false } = {}) => {
    const cached = get().details[id];
    if (!force && cached && !needsRefresh(cached, Date.now())) return cached;

    const pending = inflightDetails.get(id);
    if (pending && !force) return pending;

    const sequence = (detailSequence.get(id) ?? 0) + 1;
    detailSequence.set(id, sequence);
    const isLatest = () => detailSequence.get(id) === sequence;

    const request = (async (): Promise<CatalogDetailEntry | null> => {
      let bundle: CatalogDetailBundle | null;
      try {
        bundle = await loadCatalogDetailBundle(id, viewerId);
      } catch (error) {
        // Descartada por una mutación: su fallo no importa, cuenta la carga nueva.
        if (!isLatest()) return get().loadDetail(id, viewerId);
        throw error;
      }
      // Descartada: ni `null` (sería «no existe») ni datos de antes de la
      // mutación. Se resuelve con la carga vigente (o una nueva).
      if (!isLatest()) return get().loadDetail(id, viewerId);
      if (!bundle) {
        set((state) => {
          const details = { ...state.details };
          delete details[id];
          return { details };
        });
        return null;
      }
      const entry: CatalogDetailEntry = { ...bundle, loadedAt: Date.now(), stale: false };
      set((state) => ({ details: { ...state.details, [id]: entry } }));
      return entry;
    })().finally(() => {
      if (isLatest()) inflightDetails.delete(id);
    });
    inflightDetails.set(id, request);
    return request;
  },

  patchDetail: (id, updater) => {
    listInvalidations += 1;
    set((state) => {
      const current = state.details[id];
      if (!current) return {};
      const detail = updater(current.detail);
      return {
        details: { ...state.details, [id]: { ...current, detail } },
        // Título o textos cambiados: la lista debe reflejarlos al volver.
        listStamp: state.listStamp ? { ...state.listStamp, stale: true } : null,
      };
    });
  },

  invalidateCatalog: (id) => {
    // Una carga lanzada antes de la mutación ya no sirve: se descarta.
    detailSequence.set(id, (detailSequence.get(id) ?? 0) + 1);
    inflightDetails.delete(id);
    listInvalidations += 1;
    set((state) => {
      const current = state.details[id];
      return {
        details: current ? { ...state.details, [id]: { ...current, stale: true } } : state.details,
        listStamp: state.listStamp ? { ...state.listStamp, stale: true } : null,
      };
    });
  },
}));

/** Para mutaciones fuera de React (hooks de flujo): marca el catálogo para recargar. */
export function invalidateCatalogCache(id: string): void {
  useCatalogosStore.getState().invalidateCatalog(id);
}
