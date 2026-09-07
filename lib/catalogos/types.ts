import type { PublicCatalogProductDetail } from './publicCatalogTypes';

// Dominio de ediciones privadas. Copia de
// `catalogo-casa-ideal/src/features/private-catalogs/types.ts`; el
// `MagazineSnapshot` es el contrato que lee la revista `/c/[token]`.

export type PrivateCatalogStatus = 'draft' | 'published' | 'expired' | 'revoked' | 'archived';

/**
 * `private`: lo ve su dueño (y quien tenga acceso compartido).
 * `organization`: lo ve todo el equipo, y solo cuando deja de ser borrador.
 */
export type CatalogVisibility = 'private' | 'organization';
export type CatalogTemplate = 'editorial' | 'minimal' | 'immersive' | 'promocional';

export type PrivateCatalog = {
  id: string;
  ownerId: string;
  internalTitle: string;
  publicTitle: string;
  introduction: string | null;
  coverImageUrl: string | null;
  accentColor: string;
  template: CatalogTemplate;
  status: PrivateCatalogStatus;
  visibility: CatalogVisibility;
  showPrice: boolean;
  showAvailability: boolean;
  showSku: boolean;
  showContact: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CatalogItemType = 'product' | 'category';

export type CatalogItem = {
  id: string;
  itemType: CatalogItemType;
  referenceId: string;
  isFeatured: boolean;
  sortOrder: number;
};

export type CatalogSection = {
  id: string;
  title: string;
  kicker: string | null;
  body: string | null;
  imageUrl: string | null;
  sortOrder: number;
  items: CatalogItem[];
};

export type CatalogShareLink = {
  id: string;
  /** Token en claro para volver a copiar el enlace. `null` en los creados antes de existir la columna. */
  token: string | null;
  label: string;
  tokenHint: string;
  versionNumber: number;
  expiresAt: string;
  revokedAt: string | null;
  createdAt: string;
  firstViewedAt: string | null;
  lastViewedAt: string | null;
  viewCount: number;
};

export type CatalogShareLinkStatus = 'active' | 'expired' | 'revoked';

export type CatalogShareSummary = {
  linkCount: number;
  activeLinkCount: number;
  totalViewCount: number;
  /** Vencimiento más próximo entre los enlaces activos. */
  nextExpiration: string | null;
};

export type PrivateCatalogDetail = PrivateCatalog & {
  sections: CatalogSection[];
  shareLinks: CatalogShareLink[];
};

export type CatalogScope = 'own' | 'organization' | 'shared';

export type PrivateCatalogListItem = PrivateCatalog &
  CatalogShareSummary & {
    shareLinks: CatalogShareLink[];
    /** Lo armó quien está mirando. En móvil es la única condición para editar. */
    isOwner: boolean;
    /** Cómo llegó a la lista, para el filtro de alcance. */
    scope: CatalogScope;
  };

export type MagazineProduct = PublicCatalogProductDetail & {
  featured: boolean;
};

export type MagazineSnapshotSection = {
  id: string;
  title: string;
  kicker: string | null;
  body: string | null;
  imageUrl: string | null;
  products: MagazineProduct[];
};

export type MagazineSnapshot = {
  schemaVersion: 1;
  catalog: Pick<
    PrivateCatalog,
    'publicTitle' | 'introduction' | 'coverImageUrl' | 'accentColor' | 'template' | 'showPrice' | 'showAvailability' | 'showSku' | 'showContact'
  >;
  sections: MagazineSnapshotSection[];
  publishedAt: string;
};
