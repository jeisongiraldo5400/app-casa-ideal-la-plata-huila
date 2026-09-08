import type { CatalogShareLink, CatalogShareLinkStatus, CatalogShareSummary, PrivateCatalogStatus } from './types';

/** Vigencias ofrecidas al generar un enlace. El tope de 30 días lo impone el RPC. */
export const SHARE_LINK_DURATIONS = [
  { hours: 1, label: '1 hora' },
  { hours: 12, label: '12 horas' },
  { hours: 24, label: '24 horas' },
  { hours: 72, label: '3 días' },
  { hours: 168, label: '7 días' },
  { hours: 720, label: '30 días' },
] as const;

export const DEFAULT_SHARE_LINK_HOURS = 24;
export const MIN_SHARE_LINK_HOURS = 1;
export const MAX_SHARE_LINK_HOURS = 720;

const HOUR_MS = 3_600_000;

export function expiresAtFromHours(hours: number, now: number = Date.now()): string {
  return new Date(now + hours * HOUR_MS).toISOString();
}

/**
 * Estado derivado de un enlace. Se calcula en memoria porque «vencido»
 * depende del reloj: la base nunca lo escribe.
 */
export function catalogShareLinkStatus(link: Pick<CatalogShareLink, 'expiresAt' | 'revokedAt'>, now: number): CatalogShareLinkStatus {
  if (link.revokedAt) return 'revoked';
  return new Date(link.expiresAt).getTime() <= now ? 'expired' : 'active';
}

export function summarizeShareLinks(links: readonly CatalogShareLink[], now: number): CatalogShareSummary {
  const active = links.filter((link) => catalogShareLinkStatus(link, now) === 'active');
  return {
    linkCount: links.length,
    activeLinkCount: active.length,
    totalViewCount: links.reduce((total, link) => total + link.viewCount, 0),
    nextExpiration: active.map((link) => link.expiresAt).sort().at(0) ?? null,
  };
}

/**
 * Estado que se muestra. `catalogs.status` no basta: la base lo mueve a
 * `revoked` al revocar, pero nunca a `expired`.
 */
export function catalogDisplayStatus(
  catalog: { status: PrivateCatalogStatus } & Pick<CatalogShareSummary, 'linkCount' | 'activeLinkCount'>
): PrivateCatalogStatus {
  if (catalog.status === 'draft' || catalog.status === 'archived') return catalog.status;
  if (catalog.activeLinkCount > 0) return 'published';
  if (catalog.linkCount === 0) return catalog.status;
  return catalog.status === 'revoked' ? 'revoked' : 'expired';
}

/** Un enlace se puede copiar/compartir solo si sigue vigente y su token es recuperable. */
export function isShareLinkShareable(link: Pick<CatalogShareLink, 'token' | 'expiresAt' | 'revokedAt'>, now: number): boolean {
  return link.token !== null && catalogShareLinkStatus(link, now) === 'active';
}

export function catalogSiteUrl(): string | null {
  const site = process.env.EXPO_PUBLIC_CATALOG_SITE_URL?.trim();
  return site ? site.replace(/\/+$/, '') : null;
}

/** URL de la revista para un token. Lanza si falta configurar el sitio. */
export function buildMagazineUrl(token: string): string {
  const site = catalogSiteUrl();
  if (!site) throw new Error('Falta configurar EXPO_PUBLIC_CATALOG_SITE_URL.');
  return `${site}/c/${token}`;
}
