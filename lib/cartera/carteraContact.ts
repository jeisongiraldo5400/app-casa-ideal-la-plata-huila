/**
 * Acciones de contacto de una fila de Cartera: llamar al cliente y abrir la
 * dirección del negocio en el mapa. Puro, para probarlo sin React Native.
 */

/** `tel:` con solo dígitos y «+»; null si no hay un número marcable. */
export function telHref(phone: string | null | undefined): string | null {
  const digits = String(phone ?? '').replace(/[^\d+]/g, '');
  return digits.replace(/\D/g, '').length >= 7 ? `tel:${digits}` : null;
}

/**
 * Búsqueda en Google Maps (abre la app si está instalada, si no el
 * navegador) con la dirección del negocio, la vereda/municipio y el
 * departamento. null si no hay ni dirección ni municipio.
 */
export function mapsHref(place: {
  address?: string | null;
  municipio?: string | null;
  departamento?: string | null;
}): string | null {
  const address = place.address?.trim();
  const municipio = place.municipio?.trim();
  if (!address && !municipio) return null;
  const query = [address, municipio, place.departamento?.trim(), 'Colombia'].filter(Boolean).join(', ');
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}
