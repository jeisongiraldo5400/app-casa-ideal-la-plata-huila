/**
 * Parámetro `due` con el que un recordatorio de cobro abre Cartera filtrada
 * por una fecha de vencimiento.
 *
 * Módulo puro y sin dependencias: lo usan el enlace profundo de las
 * notificaciones (`lib/notifications/pushDeepLink`) y la pestaña de Cartera.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Devuelve la fecha `YYYY-MM-DD` si es válida, o `null`. Acepta el valor tal
 * como llega de `useLocalSearchParams` (texto o lista) o del payload del push.
 * Nunca lanza.
 */
export function parseCarteraDueParam(value: unknown): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== 'string') return null;
  const text = raw.trim();
  if (!ISO_DATE.test(text)) return null;

  const [year, month, day] = text.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  // Descarta fechas imposibles como 2026-02-30, que Date desplazaría a marzo.
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return text;
}
