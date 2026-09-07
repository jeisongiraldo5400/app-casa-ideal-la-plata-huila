import { buildPublicStorageUrl } from './storageUrl';
import type {
  PublicCatalogCategory,
  PublicCatalogContentBlock,
  PublicCatalogHighlight,
  PublicCatalogListingItem,
  PublicCatalogMediaItem,
  PublicCatalogMediaType,
  PublicCatalogProductDetail,
  PublicCatalogRelatedProduct,
  PublicCatalogSpecification,
} from './publicCatalogTypes';

// Copia de `catalogo-casa-ideal/src/features/catalog-public/mappers.ts`.
// El snapshot que se congela al crear un enlace embebe el resultado de
// `mapPublicCatalogProductDetail`, así que cualquier cambio aquí debe
// alinearse con el web (AGENTS.md §10).

const PUBLIC_IMAGE_BUCKET = 'catalog-images';
const PUBLIC_VIDEO_BUCKET = 'catalog-videos';

/** Fila de `get_public_catalog_listing` y `get_public_catalog_products_by_ids`. */
export type PublicCatalogListingRow = {
  catalog_product_id: string;
  product_id: string;
  slug: string;
  display_name: string;
  short_description: string | null;
  sale_price: number;
  category_id: string | null;
  category_name: string | null;
  brand_name: string | null;
  is_featured: boolean;
  cover_bucket: string | null;
  cover_storage_path: string | null;
  published_at: string | null;
  total_count: number;
};

export type PublicCatalogCategoryRow = { id: string; name: string };

/** jsonb de `get_public_catalog_product`; ya viene en camelCase desde SQL. */
export type PublicCatalogProductDetailRaw = {
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
  media: RawMediaItem[] | null;
  highlights: RawHighlight[] | null;
  specifications: RawSpecification[] | null;
  contentBlocks: RawContentBlock[] | null;
  relatedProducts: RawRelatedProduct[] | null;
};

type RawMediaItem = {
  id: string;
  type: string;
  bucket: string;
  storagePath: string;
  thumbnailPath: string | null;
  posterPath: string | null;
  title: string | null;
  altText: string | null;
  isCover: boolean;
  sortOrder: number;
  metadata: Record<string, unknown> | null;
};

type RawHighlight = {
  id: string;
  title: string;
  value: string;
  description: string | null;
  icon: string | null;
  sortOrder: number;
};

type RawSpecification = {
  definitionId: string;
  key: string;
  label: string;
  dataType: string;
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

type RawContentBlock = {
  id: string;
  type: string;
  configuration: Record<string, unknown> | null;
  sortOrder: number;
};

type RawRelatedProduct = {
  relationType: string;
  sortOrder: number;
  product: {
    id: string;
    productId: string;
    slug: string;
    displayName: string;
    salePrice: number;
    coverBucket: string | null;
    coverStoragePath: string | null;
  };
};

function resolvePublicImageUrl(bucket: string | null | undefined, storagePath: string | null | undefined): string | null {
  if (!bucket || !storagePath || bucket !== PUBLIC_IMAGE_BUCKET) return null;
  return buildPublicStorageUrl(bucket, storagePath);
}

/**
 * IMAGE y VIDEO resuelven a un objeto real. IMAGE_360 queda en null aunque
 * viva en `catalog-images`: su `storagePath` es un prefijo de carpeta, no un
 * archivo. 3D y documentos siguen en buckets privados.
 */
function resolvePublicMediaItemUrl(type: string, bucket: string | null | undefined, storagePath: string | null | undefined): string | null {
  if (type === 'IMAGE') return resolvePublicImageUrl(bucket, storagePath);
  if (type === 'VIDEO' && bucket === PUBLIC_VIDEO_BUCKET && storagePath) return buildPublicStorageUrl(bucket, storagePath);
  return null;
}

export function mapPublicCatalogListingRow(row: PublicCatalogListingRow): PublicCatalogListingItem {
  return {
    catalogProductId: row.catalog_product_id,
    productId: row.product_id,
    slug: row.slug,
    displayName: row.display_name,
    shortDescription: row.short_description,
    salePrice: Number(row.sale_price),
    categoryId: row.category_id,
    categoryName: row.category_name,
    brandName: row.brand_name,
    isFeatured: row.is_featured,
    coverImageUrl: resolvePublicImageUrl(row.cover_bucket, row.cover_storage_path),
    publishedAt: row.published_at,
  };
}

export function mapPublicCatalogCategoryRow(row: PublicCatalogCategoryRow): PublicCatalogCategory {
  return { id: row.id, name: row.name };
}

function mapMediaItem(raw: RawMediaItem): PublicCatalogMediaItem {
  return {
    id: raw.id,
    type: raw.type as PublicCatalogMediaType,
    bucket: raw.bucket,
    storagePath: raw.storagePath,
    thumbnailPath: raw.thumbnailPath,
    posterPath: raw.posterPath,
    title: raw.title,
    altText: raw.altText,
    isCover: raw.isCover,
    sortOrder: raw.sortOrder,
    metadata: raw.metadata ?? {},
    publicUrl: resolvePublicMediaItemUrl(raw.type, raw.bucket, raw.storagePath),
  };
}

function mapHighlight(raw: RawHighlight): PublicCatalogHighlight {
  return {
    id: raw.id,
    title: raw.title,
    value: raw.value,
    description: raw.description,
    icon: raw.icon,
    sortOrder: raw.sortOrder,
  };
}

function mapSpecification(raw: RawSpecification): PublicCatalogSpecification {
  return {
    definitionId: raw.definitionId,
    key: raw.key,
    label: raw.label,
    dataType: raw.dataType as PublicCatalogSpecification['dataType'],
    unit: raw.unit,
    isFilterable: raw.isFilterable,
    isComparable: raw.isComparable,
    groupId: raw.groupId,
    groupName: raw.groupName,
    groupSortOrder: raw.groupSortOrder,
    sortOrder: raw.sortOrder,
    valueText: raw.valueText,
    valueNumber: raw.valueNumber,
    valueBoolean: raw.valueBoolean,
    valueJson: raw.valueJson,
  };
}

function mapContentBlock(raw: RawContentBlock): PublicCatalogContentBlock {
  return {
    id: raw.id,
    type: raw.type as PublicCatalogContentBlock['type'],
    configuration: raw.configuration ?? {},
    sortOrder: raw.sortOrder,
  };
}

function mapRelatedProduct(raw: RawRelatedProduct): PublicCatalogRelatedProduct {
  return {
    relationType: raw.relationType,
    sortOrder: raw.sortOrder,
    product: {
      id: raw.product.id,
      productId: raw.product.productId,
      slug: raw.product.slug,
      displayName: raw.product.displayName,
      salePrice: raw.product.salePrice,
      coverImageUrl: resolvePublicImageUrl(raw.product.coverBucket, raw.product.coverStoragePath),
    },
  };
}

export function mapPublicCatalogProductDetail(raw: PublicCatalogProductDetailRaw): PublicCatalogProductDetail {
  return {
    id: raw.id,
    productId: raw.productId,
    slug: raw.slug,
    displayName: raw.displayName,
    subtitle: raw.subtitle,
    shortDescription: raw.shortDescription,
    marketingDescription: raw.marketingDescription,
    seoTitle: raw.seoTitle,
    seoDescription: raw.seoDescription,
    salePrice: raw.salePrice,
    isFeatured: raw.isFeatured,
    publishedAt: raw.publishedAt,
    category: raw.category,
    brand: raw.brand,
    color: raw.color,
    media: (raw.media ?? []).map(mapMediaItem),
    highlights: (raw.highlights ?? []).map(mapHighlight),
    specifications: (raw.specifications ?? []).map(mapSpecification),
    contentBlocks: (raw.contentBlocks ?? []).map(mapContentBlock),
    relatedProducts: (raw.relatedProducts ?? []).map(mapRelatedProduct),
  };
}
