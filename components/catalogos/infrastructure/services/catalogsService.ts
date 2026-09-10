import { supabase } from '@/lib/supabase';
import { mapCatalogRow, mapSections, mapShareLink, toListItem } from '@/lib/catalogos/catalogMappers';
import { DEFAULT_CATALOG_ACCENT, DEFAULT_CATALOG_TEMPLATE } from '@/lib/catalogos/constants';
import type { PrivateCatalogDetail, PrivateCatalogListItem } from '@/lib/catalogos/types';
import type { CatalogRow, ItemRow, SectionRow, ShareLinkRow, VersionRow } from '../database';

type VersionNumberRow = Pick<VersionRow, 'id' | 'version_number'>;

function versionNumbers(rows: readonly VersionNumberRow[] | null): Map<string, number> {
  return new Map((rows ?? []).map((version) => [version.id, version.version_number]));
}

async function currentUserId(): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Sesión no válida. Vuelve a iniciar sesión.');
  return user.id;
}

/**
 * Catálogos visibles para quien mira (propios + del equipo). No filtra por
 * dueño: de eso se encarga la RLS. Los enlaces solo llegan para los propios
 * (la RLS devuelve vacío en los ajenos), así que el resumen queda en cero ahí.
 */
export async function listPrivateCatalogs(viewerId: string): Promise<PrivateCatalogListItem[]> {
  const [catalogs, links, versions] = await Promise.all([
    supabase.from('catalogs').select('*').is('archived_at', null).order('updated_at', { ascending: false }),
    supabase.from('catalog_share_links').select('*').order('created_at', { ascending: false }),
    supabase.from('catalog_versions').select('id,version_number'),
  ]);
  if (catalogs.error) throw new Error(`No fue posible cargar los catálogos: ${catalogs.error.message}`);
  if (links.error) throw new Error(`No fue posible cargar los enlaces: ${links.error.message}`);
  if (versions.error) throw new Error(`No fue posible cargar las versiones: ${versions.error.message}`);

  const versionsById = versionNumbers(versions.data as VersionNumberRow[] | null);
  const linkRows = (links.data ?? []) as ShareLinkRow[];
  // Un solo instante para todo el listado: dos filas nunca discrepan sobre si un enlace venció.
  const now = Date.now();

  return ((catalogs.data ?? []) as CatalogRow[]).map((row) =>
    toListItem(row, {
      viewerId,
      now,
      shareLinks: linkRows.filter((link) => link.catalog_id === row.id).map((link) => mapShareLink(link, versionsById)),
    })
  );
}

export async function getPrivateCatalog(id: string): Promise<PrivateCatalogDetail | null> {
  const [catalog, sections, items, links, versions] = await Promise.all([
    supabase.from('catalogs').select('*').eq('id', id).maybeSingle(),
    supabase.from('catalog_sections').select('*').eq('catalog_id', id).order('sort_order'),
    supabase.from('catalog_items').select('*').eq('catalog_id', id).order('sort_order'),
    supabase.from('catalog_share_links').select('*').eq('catalog_id', id).order('created_at', { ascending: false }),
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
    ...mapCatalogRow(catalog.data as CatalogRow),
    sections: mapSections((sections.data ?? []) as SectionRow[], (items.data ?? []) as ItemRow[]),
    shareLinks: ((links.data ?? []) as ShareLinkRow[]).map((row) => mapShareLink(row, versionsById)),
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
