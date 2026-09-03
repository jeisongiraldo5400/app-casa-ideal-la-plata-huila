/** Etiquetas en español para estados de negocios y cuotas */

export const NEGOCIO_STATUS_LABEL: Record<string, string> = {
  borrador: "Borrador",
  por_firmar: "Por activar",
  activo: "Activo",
  entregado: "Entregado",
  anulado: "Anulado",
  cerrado: "Cerrado",
};

export const CUOTA_STATUS_LABEL: Record<string, string> = {
  pendiente: "Pendiente",
  parcial: "Parcial",
  pagada: "Pagada",
  mora: "En mora",
  anulada: "Anulada",
};

export const NEGOCIO_STATUS_COLOR: Record<
  string,
  "default" | "warning" | "success" | "error" | "info"
> = {
  borrador: "default",
  por_firmar: "warning",
  activo: "success",
  entregado: "info",
  anulado: "error",
  cerrado: "default",
};

export const CUOTA_STATUS_COLOR: Record<
  string,
  "default" | "warning" | "success" | "error" | "info"
> = {
  pendiente: "default",
  parcial: "warning",
  pagada: "success",
  mora: "error",
  anulada: "default",
};

export type NegocioStatusTone = "neutral" | "warning" | "success" | "error" | "info";

const toTone = (
  value: "default" | "warning" | "success" | "error" | "info" | undefined
): NegocioStatusTone => (value === "default" || value == null ? "neutral" : value);

/** Tono de `StatusChip` para un estado de negocio. */
export function negocioStatusTone(status: string): NegocioStatusTone {
  return toTone(NEGOCIO_STATUS_COLOR[status]);
}

/** Tono de `StatusChip` para un estado de cuota. */
export function cuotaStatusTone(status: string): NegocioStatusTone {
  return toTone(CUOTA_STATUS_COLOR[status]);
}

export function labelNegocioStatus(status: string) {
  return NEGOCIO_STATUS_LABEL[status] || status;
}

export function labelCuotaStatus(status: string) {
  return CUOTA_STATUS_LABEL[status] || status;
}

/**
 * Código legible de negocio.
 * Nuevos: YYYYNNN (ej. 2026001). Históricos: consecutivo corto (1, 2, …).
 */
export function formatNegocioCodigo(numero: number | null | undefined): string {
  if (numero == null || Number.isNaN(Number(numero))) return "—";
  return String(numero);
}

/** Etiqueta de UI: "Negocio 2026001" */
export function labelNegocioCodigo(numero: number | null | undefined): string {
  return `Negocio ${formatNegocioCodigo(numero)}`;
}

/** La cuota inicial se guarda como `installment_number = 0`. */
export function isCuotaInicial(installmentNumber: number | null | undefined): boolean {
  return Number(installmentNumber) === 0;
}

/** Etiqueta corta de una cuota: "Inicial" para la cuota 0, "#n" para el plan. */
export function labelCuotaNumero(installmentNumber: number | null | undefined): string {
  if (installmentNumber == null || Number.isNaN(Number(installmentNumber))) return '—';
  if (isCuotaInicial(installmentNumber)) return 'Inicial';
  return `#${installmentNumber}`;
}

/** Nombre largo de una cuota: "Cuota inicial" o "Cuota n". */
export function labelCuotaNombre(installmentNumber: number | null | undefined): string {
  if (installmentNumber == null || Number.isNaN(Number(installmentNumber))) return 'Cuota';
  if (isCuotaInicial(installmentNumber)) return 'Cuota inicial';
  return `Cuota ${installmentNumber}`;
}
