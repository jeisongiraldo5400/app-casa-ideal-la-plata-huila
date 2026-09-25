import { normalizeText } from '@/lib/search/normalizeText';
import type { PendingRemissionOption } from '../infrastructure/services/negociosDeliveryOrdersService';

/**
 * Buscador de «Enviar en remisión»: por número, responsable, zona o notas,
 * sin tildes ni mayúsculas. Término vacío devuelve la lista tal cual.
 */
export function filterPendingRemissions(
  remissions: readonly PendingRemissionOption[],
  term: string
): PendingRemissionOption[] {
  const needle = normalizeText(term);
  if (!needle) return [...remissions];
  const words = needle.split(/\s+/).filter(Boolean);
  return remissions.filter((remission) => {
    const haystack = normalizeText(
      [remission.order_number, remission.assigned_user_name, remission.zone_name, remission.notes]
        .filter(Boolean)
        .join(' ')
    );
    return words.every((word) => haystack.includes(word));
  });
}
