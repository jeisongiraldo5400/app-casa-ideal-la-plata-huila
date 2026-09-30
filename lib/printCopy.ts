import { formatPaymentDateTime } from '@/lib/localDate';

/**
 * Número de copia de un contrato o recibo impreso (`register_negocio_print`).
 * La n.º 1 es el original; desde la 2 el papel lleva la marca de copia.
 * Debe coincidir con frontend/src/lib/printCopy.ts.
 */
export type PrintCopyInfo = {
  number: number;
  /** Instante de la impresión (ISO). */
  printedAt: string;
  printedBy?: string | null;
};

export function isReprint(copy: PrintCopyInfo | null | undefined): copy is PrintCopyInfo {
  return Boolean(copy && copy.number > 1);
}

/** «COPIA N.º 2», o null si es el original. */
export function printCopyLabel(copy: PrintCopyInfo | null | undefined): string | null {
  return isReprint(copy) ? `COPIA N.º ${copy.number}` : null;
}

/** «Impresa el 30/09/2026 10:15 a. m. por Brayan Giraldo». */
export function printCopyDetail(copy: PrintCopyInfo): string {
  const by = String(copy.printedBy ?? '').trim();
  return `Impresa el ${formatPaymentDateTime(copy.printedAt)}${by ? ` por ${by}` : ''}`;
}
