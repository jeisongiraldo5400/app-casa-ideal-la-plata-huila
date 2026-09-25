import { localDateValue } from '@/lib/localDate';
import type { CarteraFilter, CarteraQuery } from './types';

/**
 * Reglas puras de los filtros del listado de cartera (móvil).
 *
 * Sin React ni Supabase: las comparten la pantalla, el modal de filtros y las
 * pruebas. Espejo de `countActiveCarteraFilters` del panel web.
 */

export const CARTERA_STATUS_LABELS: Record<CarteraFilter, string> = {
  todas: 'Todas abiertas',
  por_vencer: 'Por vencer',
  vencidas: 'Vencidas',
  mora: 'En mora',
  pagadas: 'Pagadas',
};

/** Filtros activos (para el contador del botón). La búsqueda no cuenta: tiene su propio campo. */
export function countActiveCarteraFilters(values: CarteraQuery): number {
  return [
    values.filter !== 'todas',
    Boolean(values.municipioId),
    Boolean(values.sellerId),
    Boolean(values.customerSellerId),
    Boolean(values.paymentMethodId),
    Boolean(values.gestorId),
    Boolean(values.dueFrom || values.dueTo),
  ].filter(Boolean).length;
}

/**
 * «Limpiar» deja los filtros por defecto pero conserva lo que se está buscando:
 * la búsqueda vive fuera del modal y tiene su propia «x».
 */
export function clearCarteraFilters<T extends CarteraQuery>(values: T, defaults: T): T {
  return { ...defaults, search: values.search };
}

/** `true` si el texto es una fecha ISO (aaaa-mm-dd) que existe en el calendario. */
export function isIsoDate(value: string | null | undefined): boolean {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

/**
 * Error del rango de vencimiento, o null si es válido. Cada extremo es
 * opcional y puede ser cualquier fecha, pasada o futura; solo se exige que
 * «Hasta» no quede antes de «Desde».
 */
export function dueRangeError(dueFrom: string | null | undefined, dueTo: string | null | undefined): string | null {
  if (dueFrom && !isIsoDate(dueFrom)) return 'La fecha «Desde» no es válida.';
  if (dueTo && !isIsoDate(dueTo)) return 'La fecha «Hasta» no es válida.';
  if (dueFrom && dueTo && dueTo < dueFrom) return '«Hasta» no puede ser anterior a «Desde».';
  return null;
}

export type DuePresetId = 'hoy' | 'semana' | 'mes' | 'mes_pasado' | 'mes_siguiente';

export const DUE_PRESETS: { id: DuePresetId; label: string }[] = [
  { id: 'hoy', label: 'Hoy' },
  { id: 'semana', label: 'Esta semana' },
  { id: 'mes', label: 'Este mes' },
  { id: 'mes_pasado', label: 'Mes pasado' },
  { id: 'mes_siguiente', label: 'Próximo mes' },
];

/** Rango de un atajo, calculado sobre la fecha local de `today`. La semana va de lunes a domingo. */
export function duePresetRange(id: DuePresetId, today: Date = new Date()): { dueFrom: string; dueTo: string } {
  const y = today.getFullYear();
  const m = today.getMonth();
  const d = today.getDate();
  switch (id) {
    case 'hoy': {
      const value = localDateValue(new Date(y, m, d));
      return { dueFrom: value, dueTo: value };
    }
    case 'semana': {
      const offset = (today.getDay() + 6) % 7; // lunes = 0
      return {
        dueFrom: localDateValue(new Date(y, m, d - offset)),
        dueTo: localDateValue(new Date(y, m, d - offset + 6)),
      };
    }
    case 'mes':
      return { dueFrom: localDateValue(new Date(y, m, 1)), dueTo: localDateValue(new Date(y, m + 1, 0)) };
    case 'mes_pasado':
      return { dueFrom: localDateValue(new Date(y, m - 1, 1)), dueTo: localDateValue(new Date(y, m, 0)) };
    case 'mes_siguiente':
      return { dueFrom: localDateValue(new Date(y, m + 1, 1)), dueTo: localDateValue(new Date(y, m + 2, 0)) };
  }
}

/** Atajo que coincide exactamente con el rango actual, para marcarlo como elegido. */
export function matchingDuePreset(dueFrom: string, dueTo: string, today: Date = new Date()): DuePresetId | null {
  if (!dueFrom || !dueTo) return null;
  const found = DUE_PRESETS.find(({ id }) => {
    const range = duePresetRange(id, today);
    return range.dueFrom === dueFrom && range.dueTo === dueTo;
  });
  return found?.id ?? null;
}

/**
 * Término que viaja a `get_cartera_cuotas`. Una cédula escrita con puntos o
 * espacios («1.023.456») no coincide en el servidor con la guardada sin ellos
 * (compara `id_number ILIKE`), así que un término que solo tiene dígitos y
 * separadores se envía como dígitos. El texto (nombres) se envía tal cual:
 * el servidor ya ignora tildes y mayúsculas.
 */
export function normalizeCarteraSearch(term: string | null | undefined): string {
  const value = (term || '').trim();
  if (/^[\d\s.,\-]+$/.test(value) && /\d/.test(value)) return value.replace(/\D/g, '');
  return value;
}

function shortDate(value: string): string {
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
}

/** Texto del rango para el resumen bajo «Cuotas». */
export function describeDueRange(dueFrom: string, dueTo: string): string {
  if (dueFrom && dueTo) return dueFrom === dueTo ? `Vence el ${shortDate(dueFrom)}` : `Vence del ${shortDate(dueFrom)} al ${shortDate(dueTo)}`;
  if (dueFrom) return `Vence desde el ${shortDate(dueFrom)}`;
  if (dueTo) return `Vence hasta el ${shortDate(dueTo)}`;
  return '';
}

/** Resumen legible de los filtros aplicados. */
export function describeCarteraFilters(values: CarteraQuery): string {
  const parts: string[] = [
    values.filter === 'todas'
      ? 'Todas las cuotas abiertas'
      : values.filter === 'por_vencer'
        ? `Por vencer en ${values.days} días`
        : CARTERA_STATUS_LABELS[values.filter],
  ];
  if (values.municipioId) parts.push('Municipio filtrado');
  if (values.sellerId) parts.push('Vendedor registrado en el negocio filtrado');
  if (values.customerSellerId) parts.push('Vendedor (dueño del cliente) filtrado');
  if (values.paymentMethodId) parts.push('Método de pago filtrado');
  if (values.gestorId) parts.push('Gestor filtrado');
  const range = describeDueRange(values.dueFrom || '', values.dueTo || '');
  if (range) parts.push(range);
  return parts.join(' · ');
}
