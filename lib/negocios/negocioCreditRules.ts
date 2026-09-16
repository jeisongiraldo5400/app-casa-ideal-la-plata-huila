/**
 * Reglas de crédito de un negocio compartidas entre el asistente de creación,
 * la edición y los hooks que llaman a los RPC. Misma lógica que
 * `normalize_negocio_down_payment_schedule` y `assert_negocio_installment_plan`
 * en la base de datos (migración 20260906120000). Copia de
 * `negocioCreditRules.ts` del panel web.
 *
 * - El cliente puede pactar varios abonos iniciales con fechas distintas.
 *   `negocios.down_payment` es la suma y `down_payment_date` la primera fecha;
 *   el detalle vive en `negocios.down_payment_schedule`.
 * - Si los abonos cubren el valor de los productos el negocio no lleva cuotas
 *   (`installments_count = 0`, sin fecha de primera cuota).
 * - Con saldo por financiar el vendedor define libremente el número de cuotas
 *   (entero mayor a 0, sin tope: `20260802150000_seller_defined_negocio_installments`).
 */

const DATE_VALUE = /^\d{4}-\d{2}-\d{2}$/;
const MONEY_EPSILON = 0.009;

/** Un abono inicial pactado, tal como se guarda en `negocios.down_payment_schedule`. */
export interface DownPaymentEntry {
  amount: number;
  /** YYYY-MM-DD */
  due_date: string;
}

/** Fila editable del formulario: montos y fechas todavía como texto. */
export interface DownPaymentRow {
  key: string;
  amount: string;
  dueDate: string;
}

let rowSequence = 0;

export function createDownPaymentRow(
  initial: Partial<Omit<DownPaymentRow, 'key'>> = {}
): DownPaymentRow {
  rowSequence += 1;
  return {
    key: `abono-${Date.now().toString(36)}-${rowSequence}`,
    amount: initial.amount ?? '',
    dueDate: initial.dueDate ?? '',
  };
}

const toNumber = (value: unknown): number => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : Number.NaN;
  // Montos COP enteros; los puntos de los campos de dinero ("1.500.000") son
  // separadores de miles, no decimales.
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits ? Number(digits) : Number.NaN;
};

/**
 * Lee `negocios.down_payment_schedule` (jsonb) con tolerancia a filas antiguas:
 * si viene vacío pero hay `down_payment`, se reconstruye un solo abono con
 * `down_payment_date` (o `deal_date` en negocios activados antes de tener fecha).
 */
export function parseDownPaymentSchedule(
  raw: unknown,
  legacy?: {
    down_payment?: number | string | null;
    down_payment_date?: string | null;
    deal_date?: string | null;
  }
): DownPaymentEntry[] {
  const entries: DownPaymentEntry[] = [];
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (!item || typeof item !== 'object') continue;
      const amount = toNumber((item as { amount?: unknown }).amount);
      const dueDate = String((item as { due_date?: unknown }).due_date ?? '').slice(0, 10);
      if (!Number.isFinite(amount) || amount <= 0 || !DATE_VALUE.test(dueDate)) continue;
      entries.push({ amount, due_date: dueDate });
    }
  }
  if (entries.length === 0 && legacy) {
    const amount = toNumber(legacy.down_payment);
    const dueDate = String(legacy.down_payment_date || legacy.deal_date || '').slice(0, 10);
    if (Number.isFinite(amount) && amount > 0 && DATE_VALUE.test(dueDate)) {
      entries.push({ amount, due_date: dueDate });
    }
  }
  return sortDownPaymentSchedule(entries);
}

export function sortDownPaymentSchedule(schedule: DownPaymentEntry[]): DownPaymentEntry[] {
  return [...schedule].sort((a, b) => a.due_date.localeCompare(b.due_date));
}

/** Convierte las filas del formulario en abonos (sin validar). */
export function downPaymentRowsToSchedule(rows: DownPaymentRow[]): DownPaymentEntry[] {
  return rows.map((row) => ({
    amount: toNumber(row.amount),
    due_date: row.dueDate,
  }));
}

export function downPaymentScheduleToRows(schedule: DownPaymentEntry[]): DownPaymentRow[] {
  return sortDownPaymentSchedule(schedule).map((entry) =>
    createDownPaymentRow({ amount: String(entry.amount), dueDate: entry.due_date })
  );
}

export function downPaymentScheduleTotal(schedule: DownPaymentEntry[]): number {
  return schedule.reduce((total, entry) => {
    const amount = toNumber(entry.amount);
    return total + (Number.isFinite(amount) && amount > 0 ? amount : 0);
  }, 0);
}

/** `true` cuando el abono ya tiene valor y fecha (la fila dejó de estar a medias). */
export function isCompleteDownPayment(entry: DownPaymentEntry): boolean {
  const amount = toNumber(entry.amount);
  return (
    Number.isFinite(amount) && amount > 0 && DATE_VALUE.test(String(entry.due_date ?? ''))
  );
}

/** Nombre visible de un abono según su posición: el primero es la cuota inicial. */
export function downPaymentLabel(rank: number): string {
  return rank === 0 ? 'Cuota inicial' : `Abono ${rank + 1}`;
}

/**
 * Etiqueta de cada abono **en el orden de las filas del formulario**, numerado
 * como lo guardará la base: por fecha de pago, y las filas todavía incompletas
 * al final.
 *
 * Sin esto, agregar una fila vacía la colocaba primero (su fecha vacía ordena
 * antes que cualquier otra) y renombraba la cuota inicial ya escrita como
 * «Abono 2», además de listarla en el resumen como «Cuota inicial · paga el —».
 */
export function downPaymentLabels(schedule: DownPaymentEntry[]): string[] {
  const ranked = schedule
    .map((entry, index) => ({ index, entry, complete: isCompleteDownPayment(entry) }))
    .sort((a, b) => {
      if (a.complete !== b.complete) return a.complete ? -1 : 1;
      if (a.complete && b.complete) {
        const byDate = String(a.entry.due_date).localeCompare(String(b.entry.due_date));
        if (byDate !== 0) return byDate;
      }
      return a.index - b.index;
    });

  const labels = new Array<string>(schedule.length).fill('');
  ranked.forEach((item, rank) => {
    labels[item.index] = downPaymentLabel(rank);
  });
  return labels;
}

/** Etiquetas para las filas editables del formulario (mismo criterio). */
export function downPaymentRowLabels(rows: DownPaymentRow[]): string[] {
  return downPaymentLabels(downPaymentRowsToSchedule(rows));
}

/** «de la cuota inicial» / «del abono 2», para los mensajes de error. */
function possessiveLabel(label: string): string {
  return label === 'Cuota inicial' ? 'de la cuota inicial' : `del ${label.toLowerCase()}`;
}

/**
 * Mensaje de error del cronograma de abonos iniciales, o `null` si es válido.
 * Un cronograma vacío es válido (negocio sin cuota inicial).
 */
export function downPaymentScheduleError(
  schedule: DownPaymentEntry[],
  dealDate: string,
  productsSubtotal: number
): string | null {
  const seenDates = new Set<string>();
  const labels = downPaymentLabels(schedule);
  let total = 0;
  for (let index = 0; index < schedule.length; index += 1) {
    const entry = schedule[index];
    const label = possessiveLabel(labels[index]);
    const amount = toNumber(entry.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return `Indique el valor ${label}`;
    }
    if (!DATE_VALUE.test(entry.due_date)) {
      return `Indique la fecha de pago ${label}`;
    }
    if (DATE_VALUE.test(dealDate) && entry.due_date < dealDate) {
      return `La fecha ${label} no puede ser anterior a la fecha del negocio`;
    }
    if (seenDates.has(entry.due_date)) {
      return 'No puede haber dos abonos iniciales con la misma fecha; súmelos en uno solo';
    }
    seenDates.add(entry.due_date);
    total += amount;
  }
  if (Number.isFinite(productsSubtotal) && total > productsSubtotal + MONEY_EPSILON) {
    return 'Los abonos iniciales no pueden superar el valor de los productos';
  }
  return null;
}

/** Saldo que queda por financiar después de los abonos iniciales (nunca negativo). */
export function financedAfterDownPayments(
  productsSubtotal: number,
  schedule: DownPaymentEntry[]
): number {
  const subtotal = Number.isFinite(productsSubtotal) ? Math.max(0, productsSubtotal) : 0;
  return Math.max(0, subtotal - downPaymentScheduleTotal(schedule));
}

/**
 * `true` cuando los abonos no cubren el valor de los productos y por tanto el
 * negocio necesita plan de cuotas (número de cuotas y fecha de la primera).
 */
export function requiresInstallmentPlan(
  productsSubtotal: number,
  schedule: DownPaymentEntry[]
): boolean {
  return financedAfterDownPayments(productsSubtotal, schedule) > MONEY_EPSILON;
}

/** Mensaje de error si el número de cuotas no es un entero positivo, o `null`. */
export function installmentsRangeError(installmentsCount: number): string | null {
  if (!Number.isSafeInteger(installmentsCount) || installmentsCount < 1) {
    return 'El número de cuotas debe ser un entero mayor a 0';
  }
  return null;
}

/** Versión booleana para habilitar/deshabilitar controles del asistente. */
export function isInstallmentsCountAllowed(installmentsCount: number): boolean {
  return installmentsRangeError(installmentsCount) === null;
}

/**
 * Valida el plan de cuotas frente al saldo por financiar. Misma regla que
 * `assert_negocio_installment_plan`.
 */
export function installmentPlanError(
  financedAmount: number,
  installmentsCount: number,
  firstDueDate: string | null | undefined,
  dealDate: string
): string | null {
  if (financedAmount > MONEY_EPSILON) {
    const rangeError = installmentsRangeError(installmentsCount);
    if (rangeError) return rangeError;
    if (!DATE_VALUE.test(firstDueDate || '')) {
      return 'Indique la fecha de la primera cuota';
    }
    if (DATE_VALUE.test(dealDate) && String(firstDueDate) < dealDate) {
      return 'La primera cuota no puede ser anterior a la fecha del negocio';
    }
    return null;
  }
  if (installmentsCount !== 0) {
    return 'Los abonos iniciales cubren el valor de los productos: el negocio no lleva cuotas';
  }
  return null;
}
