/** Filtros del historial de traslados (puro). */
import type { TransferStatus } from './transferModel';

export type TransferHistoryFilterKey = 'all' | 'open' | 'received' | 'differences' | 'cancelled';

export type TransferHistoryFilter = {
  key: TransferHistoryFilterKey;
  label: string;
  /** null = todos los estados. */
  statuses: readonly TransferStatus[] | null;
};

export const TRANSFER_HISTORY_FILTERS: readonly TransferHistoryFilter[] = [
  { key: 'all', label: 'Todos', statuses: null },
  { key: 'open', label: 'En curso', statuses: ['pending_dispatch', 'in_transit', 'partially_received'] },
  { key: 'received', label: 'Recibidos', statuses: ['received'] },
  { key: 'differences', label: 'Con diferencias', statuses: ['with_differences', 'closed_with_differences'] },
  { key: 'cancelled', label: 'Cancelados', statuses: ['cancelled'] },
];

export const TRANSFER_HISTORY_PAGE_SIZE = 20;

export function historyFilter(key: TransferHistoryFilterKey): TransferHistoryFilter {
  return TRANSFER_HISTORY_FILTERS.find((filter) => filter.key === key) ?? TRANSFER_HISTORY_FILTERS[0];
}
