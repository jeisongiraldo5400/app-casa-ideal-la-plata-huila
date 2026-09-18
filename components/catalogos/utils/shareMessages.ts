export type ShareMessageInput = {
  url: string;
  label?: string | null;
};

/** Nombre del destinatario recortado, o `null` si el enlace no tiene (es opcional desde 20261010110000). */
export function shareLinkRecipient(label: string | null | undefined): string | null {
  const trimmed = label?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Texto que viaja por la hoja de compartir y por WhatsApp; la URL va dentro
 * del mensaje (Android ignora `url`). Idéntico a `buildShareLinkMessage` del
 * web (`private-catalogs/share-link-recipient.ts`): saluda solo si hay nombre.
 */
export function buildShareMessage({ url, label }: ShareMessageInput): string {
  const recipient = shareLinkRecipient(label);
  return `${recipient ? `Hola ${recipient}. ` : ''}Te comparto este catálogo de Casa Ideal: ${url}`;
}

/** Abre la app de WhatsApp directamente (falla si no está instalada). */
export function buildWhatsAppAppUrl(message: string): string {
  return `whatsapp://send?text=${encodeURIComponent(message)}`;
}

/** Alternativa web: el navegador la abre siempre, esté o no la app. */
export function buildWhatsAppUrl(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}
