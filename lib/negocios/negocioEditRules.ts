import { labelNegocioStatus } from '@/lib/negocioLabels';

/**
 * Qué se puede editar de un negocio según su estado
 * (migración 20261029130000_negocio_activo_edicion_limitada).
 *
 * - Borrador y «Por activar» (`por_firmar`): edición completa con `update_negocio`.
 * - Activo, entregado y cerrado: solo dirección/ubicación y notas
 *   (`update_negocio_contact_details`, solo con conexión) y el gestor de cobro
 *   (flujo propio, desde la web).
 *
 * Copia de `frontend/src/app/admin/negocios/domain/negocioEditRules.ts`.
 * - Anulado: nada.
 */
const DRAFT_STATUSES = new Set(['borrador', 'por_firmar']);
const CONTACT_EDITABLE_STATUSES = new Set(['activo', 'entregado', 'cerrado']);

export function isNegocioDraft(status: string | null | undefined): boolean {
  return Boolean(status && DRAFT_STATUSES.has(status));
}

/** Estados en los que se ofrece «Editar dirección y notas». */
export function canEditNegocioContactDetails(status: string | null | undefined): boolean {
  return Boolean(status && CONTACT_EDITABLE_STATUSES.has(status));
}

/** Aviso para la UI; mismo texto que el mensaje del servidor. */
export function negocioLockedEditMessage(
  numero: number | string | null | undefined,
  status: string | null | undefined
): string {
  const codigo = numero ?? '—';
  if (status === 'anulado') return `El negocio ${codigo} está Anulado: no se puede editar.`;
  return (
    `El negocio ${codigo} está ${labelNegocioStatus(status || '')}: solo se pueden editar la dirección, ` +
    'las notas y el gestor de cobro. Para cambiar productos, precios, cuotas o cliente, ' +
    'un administrador debe anularlo y crear uno nuevo.'
  );
}

export interface NegocioContactDetailsInput {
  direccion: string;
  municipioId: string;
  veredaId: string;
  notes: string;
}

/** Validación previa al RPC (el servidor vuelve a validar). */
export function negocioContactDetailsError(input: NegocioContactDetailsInput): string | null {
  if (!input.municipioId) return 'Seleccione un municipio activo';
  if (!input.direccion.trim()) return 'La dirección del negocio es obligatoria';
  return null;
}

/** ¿Hay algo que guardar? Compara con los valores normalizados como el servidor. */
export function negocioContactDetailsChanged(
  current: { direccion: string | null; municipio_id: string | null; vereda_id: string | null; notes: string | null },
  input: NegocioContactDetailsInput
): boolean {
  const norm = (value: string | null | undefined) => (value ?? '').trim() || null;
  return (
    norm(current.direccion) !== norm(input.direccion) ||
    (current.municipio_id || null) !== (input.municipioId || null) ||
    (current.vereda_id || null) !== (input.veredaId || null) ||
    norm(current.notes) !== norm(input.notes)
  );
}
