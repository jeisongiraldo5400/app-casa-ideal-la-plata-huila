import { formatCatalogDateTime } from '@/lib/catalogos/labels';

export type ShareMessageInput = {
  publicTitle: string;
  url: string;
  expiresAt: string;
};

/** Texto que viaja por la hoja de compartir y por WhatsApp; la URL va dentro del mensaje (Android ignora `url`). */
export function buildShareMessage({ publicTitle, url, expiresAt }: ShareMessageInput): string {
  return `Te comparto el catálogo «${publicTitle}» de Casa Ideal: ${url}\nDisponible hasta el ${formatCatalogDateTime(expiresAt)}.`;
}

export function buildWhatsAppUrl(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}
