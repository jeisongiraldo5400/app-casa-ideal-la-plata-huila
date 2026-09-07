import type { Json } from '@/types/database.types';

// Las tablas y RPC de ediciones privadas no están en el
// `database.types.ts` generado (tampoco en el del web), y `lib/supabase.ts`
// crea el cliente sin genérico. Este shim tipa las filas tal como las
// devuelve PostgREST; los services hacen el narrowing. Copia de
// `catalogo-casa-ideal/src/features/private-catalogs/database.ts`.

export type CatalogRow = {
  id: string;
  owner_id: string;
  internal_title: string;
  public_title: string;
  introduction: string | null;
  cover_image_url: string | null;
  accent_color: string;
  template: string;
  status: string;
  visibility: string;
  show_price: boolean;
  show_availability: boolean;
  show_sku: boolean;
  show_contact: boolean;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

export type SectionRow = {
  id: string;
  catalog_id: string;
  title: string;
  kicker: string | null;
  body: string | null;
  image_url: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type ItemRow = {
  id: string;
  catalog_id: string;
  section_id: string;
  item_type: string;
  reference_id: string;
  is_featured: boolean;
  sort_order: number;
  created_at: string;
};

export type ShareLinkRow = {
  id: string;
  catalog_id: string;
  catalog_version_id: string;
  token: string | null;
  token_hash: string;
  token_hint: string;
  label: string;
  expires_at: string;
  revoked_at: string | null;
  created_by: string;
  created_at: string;
  first_viewed_at: string | null;
  last_viewed_at: string | null;
  view_count: number;
};

export type VersionRow = {
  id: string;
  catalog_id: string;
  version_number: number;
  snapshot: Json;
  created_by: string;
  created_at: string;
};

/** Respuesta de `create_private_catalog_share_link` y `reissue_private_catalog_share_link`. */
export type ShareLinkRpcResult = {
  shareLinkId: string;
  expiresAt: string;
  versionId?: string;
  versionNumber?: number;
};
