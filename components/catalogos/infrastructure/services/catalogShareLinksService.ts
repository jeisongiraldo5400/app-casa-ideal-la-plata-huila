import { supabase } from '@/lib/supabase';
import type { MagazineSnapshot } from '@/lib/catalogos/types';
import type { Json } from '@/types/database.types';
import type { ShareLinkRpcResult } from '../database';

function parseShareLinkResult(data: unknown, fallback: string): ShareLinkRpcResult {
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const record = data as Record<string, unknown>;
    if (typeof record.shareLinkId === 'string' && typeof record.expiresAt === 'string') {
      return {
        shareLinkId: record.shareLinkId,
        expiresAt: record.expiresAt,
        versionId: typeof record.versionId === 'string' ? record.versionId : undefined,
        versionNumber: typeof record.versionNumber === 'number' ? record.versionNumber : undefined,
      };
    }
  }
  throw new Error(fallback);
}

export type CreateShareLinkInput = {
  catalogId: string;
  snapshot: MagazineSnapshot;
  token: string;
  tokenHash: string;
  tokenHint: string;
  label: string;
  /** ISO. El RPC exige `now() < expiresAt <= now() + 30 días`. */
  expiresAt: string;
};

/** Congela una versión nueva y crea un enlace; los enlaces anteriores siguen vivos. */
export async function createCatalogShareLink(input: CreateShareLinkInput): Promise<ShareLinkRpcResult> {
  const { data, error } = await supabase.rpc('create_private_catalog_share_link', {
    p_catalog_id: input.catalogId,
    p_snapshot: input.snapshot as unknown as Json,
    p_token: input.token,
    p_token_hash: input.tokenHash,
    p_token_hint: input.tokenHint,
    p_label: input.label.trim(),
    p_expires_at: input.expiresAt,
  });
  if (error) throw new Error(error.message || 'No fue posible crear el enlace privado.');
  return parseShareLinkResult(data, 'La base no devolvió el enlace creado.');
}

export type ReissueShareLinkInput = {
  shareLinkId: string;
  token: string;
  tokenHash: string;
  tokenHint: string;
  expiresAt: string;
};

/** Token y vigencia nuevos sobre la MISMA versión congelada y la misma etiqueta. */
export async function reissueCatalogShareLink(input: ReissueShareLinkInput): Promise<ShareLinkRpcResult> {
  const { data, error } = await supabase.rpc('reissue_private_catalog_share_link', {
    p_share_link_id: input.shareLinkId,
    p_token: input.token,
    p_token_hash: input.tokenHash,
    p_token_hint: input.tokenHint,
    p_expires_at: input.expiresAt,
  });
  if (error) throw new Error(error.message || 'No fue posible reemitir el enlace.');
  return parseShareLinkResult(data, 'La base no devolvió el enlace reemitido.');
}
