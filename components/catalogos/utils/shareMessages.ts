import { formatCatalogDateTime } from '@/lib/catalogos/labels';

export type ShareMessageInput = {
  publicTitle: string;
  url: string;
  expiresAt: string;
  label?: string | null;
};

/** Nombre del destinatario recortado, o `null` si el enlace no tiene (es opcional desde 20261010110000). */
export function shareLinkRecipient(label: string | null | undefined): string | null {
  const trimmed = label?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}

/** Texto que viaja por la hoja de compartir y por WhatsApp; la URL va dentro del mensaje (Android ignora `url`). */
export function buildShareMessage({ publicTitle, url, expiresAt, label }: ShareMessageInput): string {
  const recipient = shareLinkRecipient(label);
  const greeting = recipient ? `Hola ${recipient}. ` : '';
  return `${greeting}Te comparto el catálogo «${publicTitle}» de Casa Ideal: ${url}\nDisponible hasta el ${formatCatalogDateTime(expiresAt)}.`;
}

export function buildWhatsAppUrl(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}
