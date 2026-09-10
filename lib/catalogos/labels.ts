import type { StatusTone } from '@/components/ui';
import type { CatalogScope, CatalogShareLinkStatus, CatalogTemplate, PrivateCatalogStatus } from './types';

/** Etiquetas y tonos del módulo de catálogos (patrón de `lib/negocioLabels.ts`). */

export const CATALOG_STATUS_LABEL: Record<PrivateCatalogStatus, string> = {
  draft: 'Borrador',
  published: 'Compartido',
  expired: 'Vencido',
  revoked: 'Revocado',
  archived: 'Archivado',
};

const CATALOG_STATUS_TONE: Record<PrivateCatalogStatus, StatusTone> = {
  draft: 'neutral',
  published: 'success',
  expired: 'warning',
  revoked: 'error',
  archived: 'neutral',
};

export function labelCatalogStatus(status: PrivateCatalogStatus): string {
  return CATALOG_STATUS_LABEL[status] ?? status;
}

export function catalogStatusTone(status: PrivateCatalogStatus): StatusTone {
  return CATALOG_STATUS_TONE[status] ?? 'neutral';
}

export const SHARE_LINK_STATUS_LABEL: Record<CatalogShareLinkStatus, string> = {
  active: 'Vigente',
  expired: 'Vencido',
  revoked: 'Revocado',
};

const SHARE_LINK_STATUS_TONE: Record<CatalogShareLinkStatus, StatusTone> = {
  active: 'success',
  expired: 'warning',
  revoked: 'error',
};

export function labelShareLinkStatus(status: CatalogShareLinkStatus): string {
  return SHARE_LINK_STATUS_LABEL[status];
}

export function shareLinkStatusTone(status: CatalogShareLinkStatus): StatusTone {
  return SHARE_LINK_STATUS_TONE[status];
}

const SCOPE_LABEL: Record<CatalogScope, string> = {
  own: 'Tuyo',
  organization: 'Catálogo global',
  shared: 'Compartido contigo',
};

export function labelCatalogScope(scope: CatalogScope): string {
  return SCOPE_LABEL[scope];
}

const TEMPLATE_LABEL: Record<CatalogTemplate, string> = {
  editorial: 'Editorial',
  minimal: 'Minimalista',
  immersive: 'Inmersivo',
  promocional: 'Promocional',
};

export function labelCatalogTemplate(template: CatalogTemplate): string {
  return TEMPLATE_LABEL[template] ?? template;
}

const dateTimeFormatter = new Intl.DateTimeFormat('es-CO', {
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
});

const dateFormatter = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });

/** «5 sept, 3:40 p. m.» para vencimientos y aperturas. */
export function formatCatalogDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '—' : dateTimeFormatter.format(date);
}

/** «5 sept 2026» para fechas sin hora. */
export function formatCatalogDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '—' : dateFormatter.format(date);
}

export function pluralize(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
