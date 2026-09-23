import { formatNegocioCodigo } from '@/lib/negocioLabels';
import { matchesDigits, matchesNormalized } from '@/lib/search/normalizeText';

export type NegocioListFilter = 'all' | 'active' | 'overdue' | 'draft';

export const NEGOCIO_LIST_FILTERS: { value: NegocioListFilter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'active', label: 'Activos' },
  { value: 'overdue', label: 'En mora' },
  { value: 'draft', label: 'Borradores' },
];

const ACTIVE_STATUSES = ['activo', 'entregado'];
const DRAFT_STATUSES = ['borrador', 'por_firmar'];

export function matchesNegocioListFilter(item: any, filter: NegocioListFilter) {
  switch (filter) {
    case 'active':
      return ACTIVE_STATUSES.includes(item.status);
    case 'overdue':
      return Boolean(item.has_mora);
    case 'draft':
      return DRAFT_STATUSES.includes(item.status);
    default:
      return true;
  }
}

export function matchesNegocioListQuery(item: any, query: string) {
  if (!query) return true;
  // Sin tildes: «alvaro munoz» tiene que encontrar a «Álvaro Muñoz». Y el
  // número por sus dígitos, para que «2026-0003» valga igual que «20260003».
  // El documento del cliente entra por dígitos (los puntos no estorban): sin él
  // buscar una cédula no devolvía nada, ni sin señal ni con ella (el servidor sí
  // filtraba por documento, pero este filtro local descartaba el resultado).
  return (
    matchesNormalized(query, formatNegocioCodigo(item.numero), item.customer?.name) ||
    matchesDigits(query, item.numero, item.customer?.id_number)
  );
}
