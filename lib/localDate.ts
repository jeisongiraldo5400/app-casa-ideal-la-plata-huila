/**
 * Fecha calendario local (YYYY-MM-DD).
 * Evita el desfase de toISOString() (UTC) en Colombia (UTC-5).
 */
export function localDateValue(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
