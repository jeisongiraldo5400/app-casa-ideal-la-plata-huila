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

export const PAYMENT_TIME_ZONE = 'America/Bogota';

function bogotaParts(date: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: PAYMENT_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function formatTwelveHourTime(hour: string, minute: string): string {
  const hour24 = Number(hour);
  const hour12 = hour24 % 12 || 12;
  const period = hour24 >= 12 ? 'p. m.' : 'a. m.';
  return `${hour12}:${minute} ${period}`;
}

export function formatPaymentDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-');
    return `${day}/${month}/${year}`;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  const parts = bogotaParts(parsed);
  return `${parts.day}/${parts.month}/${parts.year} ${formatTwelveHourTime(parts.hour, parts.minute)}`;
}
