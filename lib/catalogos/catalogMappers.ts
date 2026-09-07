import type { CatalogRow, ItemRow, SectionRow, ShareLinkRow } from '@/components/catalogos/infrastructure/database';
import { summarizeShareLinks } from './shareLinks';
import type { CatalogSection, CatalogShareLink, PrivateCatalog, PrivateCatalogListItem } from './types';

// Copia de las funciones privadas de
// `catalogo-casa-ideal/src/features/private-catalogs/queries.server.ts`.

export function mapCatalogRow(row: CatalogRow): PrivateCatalog {
  return {
    id: row.id,
    ownerId: row.owner_id,
    internalTitle: row.internal_title,
    publicTitle: row.public_title,
    introduction: row.introduction,
    coverImageUrl: row.cover_image_url,
    accentColor: row.accent_color,
    template: row.template as PrivateCatalog['template'],
    status: row.status as PrivateCatalog['status'],
    visibility: row.visibility as PrivateCatalog['visibility'],
    showPrice: row.show_price,
    showAvailability: row.show_availability,
    showSku: row.show_sku,
    showContact: row.show_contact,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapSections(sectionRows: readonly SectionRow[], itemRows: readonly ItemRow[]): CatalogSection[] {
  return sectionRows.map((section) => ({
    id: section.id,
    title: section.title,
    kicker: section.kicker,
    body: section.body,
    imageUrl: section.image_url,
    sortOrder: section.sort_order,
    items: itemRows
      .filter((item) => item.section_id === section.id)
      .map((item) => ({
        id: item.id,
        itemType: item.item_type as CatalogSection['items'][number]['itemType'],
        referenceId: item.reference_id,
        isFeatured: item.is_featured,
        sortOrder: item.sort_order,
      })),
  }));
}

export function mapShareLink(row: ShareLinkRow, versionNumbers: ReadonlyMap<string, number>): CatalogShareLink {
  return {
    id: row.id,
    token: row.token,
    label: row.label,
    tokenHint: row.token_hint,
    versionNumber: versionNumbers.get(row.catalog_version_id) ?? 1,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    createdAt: row.created_at,
    firstViewedAt: row.first_viewed_at,
    lastViewedAt: row.last_viewed_at,
    viewCount: Number(row.view_count),
  };
}

export function toListItem(
  row: CatalogRow,
  input: { viewerId: string; shareLinks: CatalogShareLink[]; now: number }
): PrivateCatalogListItem {
  const isOwner = row.owner_id === input.viewerId;
  return {
    ...mapCatalogRow(row),
    ...summarizeShareLinks(input.shareLinks, input.now),
    shareLinks: input.shareLinks,
    isOwner,
    scope: isOwner ? 'own' : row.visibility === 'organization' ? 'organization' : 'shared',
  };
}
