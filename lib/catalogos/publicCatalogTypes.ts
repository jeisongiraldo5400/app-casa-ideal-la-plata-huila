// Forma camelCase de las fichas públicas que devuelven los RPC
// `get_public_catalog_listing` / `get_public_catalog_products_by_ids` /
// `get_public_catalog_product`. Copia de
// `catalogo-casa-ideal/src/features/catalog-public/types.ts`: el snapshot de
// una edición embebe estos objetos tal cual, así que deben coincidir.

export type PublicCatalogListingItem = {
  catalogProductId: string;
  productId: string;
  slug: string;
  displayName: string;
  shortDescription: string | null;
  salePrice: number;
  categoryId: string | null;
  categoryName: string | null;
  brandName: string | null;
  isFeatured: boolean;
  /** null cuando la ficha no tiene portada o la portada no es una imagen. */
  coverImageUrl: string | null;
  publishedAt: string | null;
};

export type PublicCatalogListingResult = {
  items: PublicCatalogListingItem[];
  totalCount: number;
};

export type PublicCatalogCategory = {
  id: string;
  name: string;
};

export type PublicCatalogMediaType = 'IMAGE' | 'VIDEO' | 'IMAGE_360' | 'MODEL_3D' | 'MODEL_USDZ' | 'DOCUMENT';

export type PublicCatalogMediaItem = {
  id: string;
  type: PublicCatalogMediaType;
  bucket: string;
  storagePath: string;
  thumbnailPath: string | null;
  posterPath: string | null;
  title: string | null;
  altText: string | null;
  isCover: boolean;
  sortOrder: number;
  metadata: Record<string, unknown>;
  /** URL directa del objeto (IMAGE y VIDEO en buckets públicos); null para 360°, 3D y documentos. */
  publicUrl: string | null;
};

export type PublicCatalogHighlight = {
  id: string;
  title: string;
  value: string;
  description: string | null;
  icon: string | null;
  sortOrder: number;
};

export type PublicCatalogSpecificationDataType = 'text' | 'number' | 'boolean' | 'select' | 'multiselect';

export type PublicCatalogSpecification = {
  definitionId: string;
  key: string;
  label: string;
  dataType: PublicCatalogSpecificationDataType;
  unit: string | null;
  isFilterable: boolean;
  isComparable: boolean;
  groupId: string;
  groupName: string;
  groupSortOrder: number;
  sortOrder: number;
  valueText: string | null;
  valueNumber: number | null;
  valueBoolean: boolean | null;
  valueJson: unknown;
};

export type PublicCatalogContentBlockType =
  | 'HERO'
  | 'IMAGE_TEXT'
  | 'VIDEO'
  | 'GALLERY'
  | 'HIGHLIGHTS'
  | 'SPECIFICATIONS'
  | 'MODEL_3D'
  | 'CTA'
  | 'RELATED_PRODUCTS';

export type PublicCatalogContentBlock = {
  id: string;
  type: PublicCatalogContentBlockType;
  configuration: Record<string, unknown>;
  sortOrder: number;
};

export type PublicCatalogRelatedProduct = {
  relationType: string;
  sortOrder: number;
  product: {
    id: string;
    productId: string;
    slug: string;
    displayName: string;
    salePrice: number;
    coverImageUrl: string | null;
  };
};

export type PublicCatalogProductDetail = {
  id: string;
  productId: string;
  slug: string;
  displayName: string;
  subtitle: string | null;
  shortDescription: string | null;
  marketingDescription: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  salePrice: number;
  isFeatured: boolean;
  publishedAt: string | null;
  category: { id: string; name: string } | null;
  brand: { id: string; name: string } | null;
  color: { id: string; name: string } | null;
  media: PublicCatalogMediaItem[];
  highlights: PublicCatalogHighlight[];
  specifications: PublicCatalogSpecification[];
  contentBlocks: PublicCatalogContentBlock[];
  relatedProducts: PublicCatalogRelatedProduct[];
};
