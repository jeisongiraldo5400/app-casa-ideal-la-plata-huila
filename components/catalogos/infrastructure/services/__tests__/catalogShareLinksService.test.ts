const mockRpc = jest.fn();

jest.mock('@/lib/supabase', () => ({ supabase: { rpc: (...args: unknown[]) => mockRpc(...args) } }));

import type { MagazineSnapshot } from '@/lib/catalogos/types';
import { createCatalogShareLink, reissueCatalogShareLink } from '../catalogShareLinksService';

const snapshot = {
  schemaVersion: 1,
  catalog: { publicTitle: 'Público', introduction: null, coverImageUrl: null, accentColor: '#1e3a8a', template: 'editorial', showPrice: false, showAvailability: false, showSku: false, showContact: true },
  sections: [],
  publishedAt: '2026-09-07T12:00:00.000Z',
} as MagazineSnapshot;

const input = {
  catalogId: 'cat-1',
  snapshot,
  token: 'a'.repeat(43),
  tokenHash: 'b'.repeat(64),
  tokenHint: 'aaaaaa',
  label: '  Familia Pérez  ',
  expiresAt: '2026-09-08T12:00:00.000Z',
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('createCatalogShareLink', () => {
  it('envía los siete parámetros del RPC con la etiqueta recortada', async () => {
    mockRpc.mockResolvedValueOnce({ data: { shareLinkId: 'link-1', expiresAt: input.expiresAt, versionId: 'v-1', versionNumber: 2 }, error: null });

    const result = await createCatalogShareLink(input);

    expect(mockRpc).toHaveBeenCalledWith('create_private_catalog_share_link', {
      p_catalog_id: 'cat-1',
      p_snapshot: snapshot,
      p_token: input.token,
      p_token_hash: input.tokenHash,
      p_token_hint: input.tokenHint,
      p_label: 'Familia Pérez',
      p_expires_at: input.expiresAt,
    });
    expect(result).toEqual({ shareLinkId: 'link-1', expiresAt: input.expiresAt, versionId: 'v-1', versionNumber: 2 });
  });

  it('propaga el mensaje del RPC (vigencia, permisos, formato del token)', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'La vigencia máxima es de 30 días.' } });
    await expect(createCatalogShareLink(input)).rejects.toThrow('La vigencia máxima es de 30 días.');
  });

  it('falla si la respuesta no trae el enlace', async () => {
    mockRpc.mockResolvedValueOnce({ data: { algo: 'raro' }, error: null });
    await expect(createCatalogShareLink(input)).rejects.toThrow('La base no devolvió el enlace creado.');
  });
});

describe('reissueCatalogShareLink', () => {
  it('envía el id del enlace y el token nuevo, sin snapshot', async () => {
    mockRpc.mockResolvedValueOnce({ data: { shareLinkId: 'link-1', expiresAt: input.expiresAt }, error: null });

    await reissueCatalogShareLink({
      shareLinkId: 'link-1',
      token: input.token,
      tokenHash: input.tokenHash,
      tokenHint: input.tokenHint,
      expiresAt: input.expiresAt,
    });

    expect(mockRpc).toHaveBeenCalledWith('reissue_private_catalog_share_link', {
      p_share_link_id: 'link-1',
      p_token: input.token,
      p_token_hash: input.tokenHash,
      p_token_hint: input.tokenHint,
      p_expires_at: input.expiresAt,
    });
  });
});
