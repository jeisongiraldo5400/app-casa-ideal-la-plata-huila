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
