import {
  buildMagazineUrl,
  catalogDisplayStatus,
  catalogShareLinkStatus,
  expiresAtFromHours,
  isShareLinkShareable,
  summarizeShareLinks,
} from '../shareLinks';
import type { CatalogShareLink } from '../types';

const NOW = Date.parse('2026-09-07T12:00:00.000Z');
const HOUR = 3_600_000;

function link(overrides: Partial<CatalogShareLink> = {}): CatalogShareLink {
  return {
    id: 'link-1',
    token: 'token-de-prueba',
    label: 'Familia Pérez',
    tokenHint: 'a1b2c3',
    versionNumber: 1,
    expiresAt: new Date(NOW + HOUR).toISOString(),
    revokedAt: null,
    createdAt: new Date(NOW - HOUR).toISOString(),
    firstViewedAt: null,
    lastViewedAt: null,
    viewCount: 0,
    ...overrides,
  };
}

describe('catalogShareLinkStatus', () => {
  it('marca activo el enlace vigente y sin revocar', () => {
    expect(catalogShareLinkStatus(link(), NOW)).toBe('active');
  });

  it('trata el instante exacto de vencimiento como vencido', () => {
    expect(catalogShareLinkStatus(link({ expiresAt: new Date(NOW).toISOString() }), NOW)).toBe('expired');
  });

  it('la revocación gana sobre la vigencia', () => {
    expect(catalogShareLinkStatus(link({ revokedAt: new Date(NOW - HOUR).toISOString() }), NOW)).toBe('revoked');
  });
});

describe('summarizeShareLinks', () => {
  it('sin enlaces devuelve el resumen vacío', () => {
    expect(summarizeShareLinks([], NOW)).toEqual({ linkCount: 0, activeLinkCount: 0, totalViewCount: 0, nextExpiration: null });
  });

  it('cuenta solo los activos y suma las aperturas de todos', () => {
    const summary = summarizeShareLinks(
      [
        link({ id: 'a', viewCount: 3 }),
        link({ id: 'b', viewCount: 5, expiresAt: new Date(NOW - HOUR).toISOString() }),
        link({ id: 'c', viewCount: 2, revokedAt: new Date(NOW).toISOString() }),
        link({ id: 'd', viewCount: 1, expiresAt: new Date(NOW + 4 * HOUR).toISOString() }),
      ],
      NOW
    );
    expect(summary.linkCount).toBe(4);
    expect(summary.activeLinkCount).toBe(2);
    expect(summary.totalViewCount).toBe(11);
  });

  it('el próximo vencimiento es el más cercano entre los activos', () => {
    const summary = summarizeShareLinks(
      [
        link({ id: 'a', expiresAt: new Date(NOW + 5 * HOUR).toISOString() }),
        link({ id: 'b', expiresAt: new Date(NOW + 2 * HOUR).toISOString() }),
        link({ id: 'c', expiresAt: new Date(NOW + HOUR).toISOString(), revokedAt: new Date(NOW).toISOString() }),
      ],
      NOW
    );
    expect(summary.nextExpiration).toBe(new Date(NOW + 2 * HOUR).toISOString());
  });
});

describe('catalogDisplayStatus', () => {
  it('un borrador sigue siendo borrador aunque no tenga enlaces', () => {
    expect(catalogDisplayStatus({ status: 'draft', linkCount: 0, activeLinkCount: 0 })).toBe('draft');
  });

  it('aunque la base diga revocado, un enlace activo lo devuelve a publicado', () => {
    expect(catalogDisplayStatus({ status: 'revoked', linkCount: 2, activeLinkCount: 1 })).toBe('published');
  });

  it('sin enlaces activos y sin revocación explícita, muestra vencido', () => {
    expect(catalogDisplayStatus({ status: 'published', linkCount: 2, activeLinkCount: 0 })).toBe('expired');
  });

  it('archivado manda sobre cualquier enlace', () => {
    expect(catalogDisplayStatus({ status: 'archived', linkCount: 1, activeLinkCount: 1 })).toBe('archived');
  });
});

describe('isShareLinkShareable', () => {
  it('exige token recuperable y enlace vigente', () => {
    expect(isShareLinkShareable(link(), NOW)).toBe(true);
    expect(isShareLinkShareable(link({ token: null }), NOW)).toBe(false);
    expect(isShareLinkShareable(link({ expiresAt: new Date(NOW - 1).toISOString() }), NOW)).toBe(false);
  });
});

describe('expiresAtFromHours y buildMagazineUrl', () => {
  it('suma las horas pedidas', () => {
    expect(expiresAtFromHours(24, NOW)).toBe(new Date(NOW + 24 * HOUR).toISOString());
  });

  it('arma la URL de la revista con el origen configurado', () => {
    expect(buildMagazineUrl('abc123')).toBe('https://catalogo.test/c/abc123');
  });

  it('lanza cuando falta el origen', () => {
    const previous = process.env.EXPO_PUBLIC_CATALOG_SITE_URL;
    delete process.env.EXPO_PUBLIC_CATALOG_SITE_URL;
    expect(() => buildMagazineUrl('abc123')).toThrow('EXPO_PUBLIC_CATALOG_SITE_URL');
    process.env.EXPO_PUBLIC_CATALOG_SITE_URL = previous;
  });
});
