/**
 * Documento de identidad del cliente comparado como en el servidor.
 *
 * Espejo de `public.norm_document` (migración 20261219120000): mayúsculas y
 * solo letras y dígitos. «1.234.567», «1 234 567» y «1234567» son el mismo
 * cliente. El documento se GUARDA como lo escribió el usuario; esta forma solo
 * sirve para detectar duplicados.
 */
export function normalizeCustomerDocument(value: string | null | undefined): string {
  if (!value) return '';
  // Letras latinas en mayúscula (incluye Ñ y vocales con tilde, como `[:alnum:]`).
  return value.toUpperCase().replace(/[^0-9A-ZÀ-ÖØ-Þ]/g, '');
}

export function sameCustomerDocument(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = normalizeCustomerDocument(a);
  return left !== '' && left === normalizeCustomerDocument(b);
}

/** Cliente que ya tiene ese documento. */
export type CustomerWithDocument = {
  id: string;
  name: string;
  id_number: string;
  /** Eliminado: el documento sigue ocupado, pero no aparece en las búsquedas. */
  deleted: boolean;
};

/** Mismo texto que el trigger `enforce_customer_document_unique`. */
export function duplicateCustomerDocumentMessage(existing: Pick<CustomerWithDocument, 'name' | 'id_number'>): string {
  return `Ya existe un cliente con el documento ${existing.id_number} (${existing.name}).`;
}

/** Rechazo del alta sin señal: el teléfono ya tiene un cliente con ese documento. */
export class DuplicateCustomerDocumentError extends Error {
  readonly existing: CustomerWithDocument;

  constructor(existing: CustomerWithDocument) {
    super(duplicateCustomerDocumentMessage(existing));
    this.name = 'DuplicateCustomerDocumentError';
    this.existing = existing;
  }
}

/** Mensajes del servidor (trigger y alta sin señal) cuando el documento ya está ocupado. */
const DUPLICATE_DOCUMENT_TEXT = /^Ya existe un cliente con el documento |^El documento .+ pertenece a .+, que fue eliminado\./;

export function isDuplicateCustomerDocumentMessage(message: string | null | undefined): boolean {
  return Boolean(message) && DUPLICATE_DOCUMENT_TEXT.test(message as string);
}
