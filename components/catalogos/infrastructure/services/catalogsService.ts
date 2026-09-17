import { supabase } from '@/lib/supabase';
import { mapCatalogRow, mapSections, mapShareLink, toListItem } from '@/lib/catalogos/catalogMappers';
import { DEFAULT_CATALOG_ACCENT, DEFAULT_CATALOG_TEMPLATE } from '@/lib/catalogos/constants';
import type { PrivateCatalogDetail, PrivateCatalogListItem } from '@/lib/catalogos/types';
import type { CatalogRow, ItemRow, SectionRow, ShareLinkRow, ShareLinkSummaryRow, VersionRow } from '../database';

type VersionNumberRow = Pick<VersionRow, 'id' | 'version_number'>;
type PostgrestPage<T> = { data: T[] | null; error: { message: string } | null };

/** Tope de filas que PostgREST devuelve por petición. */
export const POSTGREST_PAGE_SIZE = 1000;
/** Ids por filtro `in` (mantiene la URL corta). */
export const IN_FILTER_BATCH_SIZE = 100;

const CATALOG_COLUMNS =
  'id,owner_id,internal_title,public_title,introduction,cover_image_url,accent_color,template,status,visibility,show_price,show_availability,show_sku,show_contact,created_at,updated_at';
/** El listado solo resume los enlaces: sin token ni hash. */
const LINK_SUMMARY_COLUMNS = 'id,catalog_id,catalog_version_id,label,token_hint,expires_at,revoked_at,created_at,first_viewed_at,last_viewed_at,view_count';
/** El detalle sí necesita el token en claro para volver a copiar o enviar el enlace. */
const LINK_DETAIL_COLUMNS = `${LINK_SUMMARY_COLUMNS},token`;

function versionNumbers(rows: readonly VersionNumberRow[] | null): Map<string, number> {
  return new Map((rows ?? []).map((version) => [version.id, version.version_number]));
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
}

/** Recorre una consulta por rangos hasta agotarla (PostgREST corta en 1000 filas). */
async function fetchAllPages<T>(query: (from: number, to: number) => PromiseLike<PostgrestPage<T>>, failure: string): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += POSTGREST_PAGE_SIZE) {
    const { data, error } = await query(from, from + POSTGREST_PAGE_SIZE - 1);
    if (error) throw new Error(`${failure}: ${error.message}`);
    const page = data ?? [];
    rows.push(...page);
    if (page.length < POSTGREST_PAGE_SIZE) return rows;
  }
}

/** Filas de `table` cuyo `column` está en `ids`, por lotes y paginadas. */
async function fetchByIds<T>(
  ids: readonly string[],
  load: (batch: string[], from: number, to: number) => PromiseLike<PostgrestPage<T>>,
  failure: string
): Promise<T[]> {
  const batches = await Promise.all(chunk(ids, IN_FILTER_BATCH_SIZE).map((batch) => fetchAllPages((from, to) => load(batch, from, to), failure)));
  return batches.flat();
}

/**
 * Usuario de la sesión guardada en el dispositivo. A diferencia de
 * `auth.getUser()`, no hace una petición al servidor en cada carga.
 */
export async function currentUserId(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const userId = session?.user?.id;
  if (!userId) throw new Error('Sesión no válida. Vuelve a iniciar sesión.');
  return userId;
}

/**
 * Catálogos visibles para quien mira (propios + del equipo). No filtra por
 * dueño: de eso se encarga la RLS. Los enlaces solo llegan para los propios
 * (la RLS devuelve vacío en los ajenos), así que el resumen queda en cero ahí.
 * Enlaces y versiones se piden solo para los catálogos listados.
 */
export async function listPrivateCatalogs(viewerId: string): Promise<PrivateCatalogListItem[]> {
  const catalogRows = await fetchAllPages<CatalogRow>(
    (from, to) =>
      supabase
        .from('catalogs')
        .select(CATALOG_COLUMNS)
        .is('archived_at', null)
        .order('updated_at', { ascending: false })
        .order('id')
        .range(from, to),
    'No fue posible cargar los catálogos'
  );
  const catalogIds = catalogRows.map((row) => row.id);

  const [linkRows, versionRows] = await Promise.all([
    fetchByIds<ShareLinkSummaryRow>(
      catalogIds,
      (batch, from, to) =>
        supabase
          .from('catalog_share_links')
          .select(LINK_SUMMARY_COLUMNS)
          .in('catalog_id', batch)
          .order('created_at', { ascending: false })
          .order('id')
          .range(from, to),
      'No fue posible cargar los enlaces'
    ),
    fetchByIds<VersionNumberRow>(
      catalogIds,
      (batch, from, to) => supabase.from('catalog_versions').select('id,version_number').in('catalog_id', batch).order('id').range(from, to),
      'No fue posible cargar las versiones'
    ),
  ]);

  const versionsById = versionNumbers(versionRows);
  const linksByCatalog = new Map<string, ShareLinkSummaryRow[]>();
  for (const link of linkRows) {
    const bucket = linksByCatalog.get(link.catalog_id);
    if (bucket) bucket.push(link);
    else linksByCatalog.set(link.catalog_id, [link]);
  }
  // Un solo instante para todo el listado: dos filas nunca discrepan sobre si un enlace venció.
  const now = Date.now();

  return catalogRows.map((row) =>
    toListItem(row, {
      viewerId,
      now,
      shareLinks: (linksByCatalog.get(row.id) ?? []).map((link) => mapShareLink(link, versionsById)),
    })
  );
}

export async function getPrivateCatalog(id: string): Promise<PrivateCatalogDetail | null> {
  const [catalog, sections, items, links, versions] = await Promise.all([
    supabase.from('catalogs').select(CATALOG_COLUMNS).eq('id', id).maybeSingle(),
    supabase.from('catalog_sections').select('*').eq('catalog_id', id).order('sort_order'),
    supabase.from('catalog_items').select('*').eq('catalog_id', id).order('sort_order'),
    supabase.from('catalog_share_links').select(LINK_DETAIL_COLUMNS).eq('catalog_id', id).order('created_at', { ascending: false }),
    supabase.from('catalog_versions').select('id,version_number').eq('catalog_id', id),
  ]);
  if (catalog.error) throw new Error(`No fue posible cargar el catálogo: ${catalog.error.message}`);
  if (!catalog.data) return null;
  if (sections.error) throw new Error(`No fue posible cargar las categorías: ${sections.error.message}`);
  if (items.error) throw new Error(`No fue posible cargar los productos seleccionados: ${items.error.message}`);
  if (links.error) throw new Error(`No fue posible cargar los enlaces: ${links.error.message}`);
  if (versions.error) throw new Error(`No fue posible cargar las versiones: ${versions.error.message}`);

  const versionsById = versionNumbers(versions.data as VersionNumberRow[] | null);
  return {
    ...mapCatalogRow(catalog.data as unknown as CatalogRow),
    sections: mapSections((sections.data ?? []) as SectionRow[], (items.data ?? []) as ItemRow[]),
    shareLinks: ((links.data ?? []) as unknown as ShareLinkRow[]).map((row) => mapShareLink(row, versionsById)),
  };
}

export type CreatePrivateCatalogInput = {
  internalTitle: string;
  /** Vacío hereda el nombre interno. */
  publicTitle?: string | null;
};

/**
 * Mismo insert que `createPrivateCatalogAction` del web. No envía
 * `visibility`: el trigger `set_catalog_default_visibility` la sube a
 * `organization` cuando quien crea es administrador.
 */
export async function createPrivateCatalog(input: CreatePrivateCatalogInput): Promise<{ id: string }> {
  const ownerId = await currentUserId();
  const internalTitle = input.internalTitle.trim();
  const publicTitle = input.publicTitle?.trim() || internalTitle;

  const { data, error } = await supabase
    .from('catalogs')
    .insert({
      owner_id: ownerId,
      internal_title: internalTitle,
      public_title: publicTitle,
      introduction: null,
      cover_image_url: null,
      accent_color: DEFAULT_CATALOG_ACCENT,
      template: DEFAULT_CATALOG_TEMPLATE,
      status: 'draft',
      show_price: false,
      show_availability: false,
      show_sku: false,
      show_contact: true,
    })
    .select('id')
    .single();

  if (error) throw new Error(`No fue posible crear el catálogo: ${error.message}`);
  return { id: (data as Pick<CatalogRow, 'id'>).id };
}

export type CoverTextUpdate = {
  internalTitle: string;
  publicTitle: string;
  introduction: string | null;
};

export async function updateCatalogCoverText(catalogId: string, input: CoverTextUpdate): Promise<void> {
  const { error } = await supabase
    .from('catalogs')
    .update({
      internal_title: input.internalTitle.trim(),
      public_title: input.publicTitle.trim(),
      introduction: input.introduction,
    })
    .eq('id', catalogId);
  if (error) throw new Error(`No fue posible guardar los textos: ${error.message}`);
}

/** Revoca todos los enlaces y archiva. Solo el dueño (lo exige el RPC). */
export async function archiveOwnCatalog(catalogId: string): Promise<void> {
  const { error } = await supabase.rpc('archive_own_catalog', { p_catalog_id: catalogId });
  if (error) throw new Error(`No fue posible archivar el catálogo: ${error.message}`);
}
