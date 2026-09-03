import { formatNegocioCodigo } from '@/lib/negocioLabels';

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
  const haystack = `${formatNegocioCodigo(item.numero)} ${item.customer?.name || ''}`.toLowerCase();
  return haystack.includes(query);
}
