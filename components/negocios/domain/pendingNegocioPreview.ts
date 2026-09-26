/**
 * Ficha de un negocio creado sin señal que el servidor todavía no confirma.
 *
 * La fila local de ese negocio sólo guarda lo necesario para la lista (número
 * 0, cliente, total). Los productos y el plan de cuotas viven en el comando
 * `create_negocio` encolado: son los mismos argumentos que recibirá el RPC.
 * Aquí se traducen a la forma que pinta la ficha, sin tocar la cola.
 *
 * Las cuotas son un PLAN: el servidor las crea al activar el negocio, con la
 * misma regla que `activate_negocio` (abonos iniciales como cuota 0 con su
 * fecha; cuotas cada 7 días, 15 días o un mes desde la primera fecha).
 */
import { parseDownPaymentSchedule } from '@/lib/negocios/negocioCreditRules';
import type { NegocioSyncState } from '@/lib/offline/sync/negocioPendingSync';

export type PendingNegocioSync = {
  state: NegocioSyncState;
  /** Motivo del rechazo tal como lo devolvió el servidor (solo si fue rechazado). */
  reason: string | null;
};

/** Título de la ficha mientras el servidor no asigna número. */
export const PENDING_NEGOCIO_TITLE = 'Pendiente de enviar · sin número aún';
export const REJECTED_NEGOCIO_TITLE = 'No se pudo enviar · sin número';

export function pendingNegocioTitle(sync: PendingNegocioSync): string {
  return sync.state === 'rejected' ? REJECTED_NEGOCIO_TITLE : PENDING_NEGOCIO_TITLE;
}

export type PendingProductName = { name: string | null; sku: string | null };

export type PendingNegocioItem = {
  id: string;
  quantity: number;
  description: string | null;
  product_id: string;
  unit_price: number;
  subtotal: number;
  warehouse: null;
  product: PendingProductName;
};

export type PendingNegocioCuota = {
  id: string;
  negocio_id: string;
  installment_number: number;
  due_date: string;
  amount: number;
  paid_amount: number;
  late_fee_amount: number;
  status: 'pendiente';
};

export type PendingNegocioPreview = {
  /** Campos del negocio que la fila local no guarda (plan, subtotal, notas). */
  negocioFields: Record<string, unknown>;
  items: PendingNegocioItem[];
  cuotas: PendingNegocioCuota[];
};

const num = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const str = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Suma días o meses como Postgres (`+ interval '1 month'` recorta al fin de mes). */
export function addFrequency(date: string, frequency: string, steps: number): string {
  const [y, m, d] = date.split('-').map(Number);
  if (frequency === 'semanal' || frequency === 'quincenal') {
    const days = (frequency === 'semanal' ? 7 : 15) * steps;
    return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
  }
  const monthIndex = m - 1 + steps;
  const year = y + Math.floor(monthIndex / 12);
  const month = ((monthIndex % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(d, lastDay))).toISOString().slice(0, 10);
}

/**
 * Productos y plan del negocio pendiente a partir de los argumentos del RPC
 * encolado. `productNames` viene del catálogo descargado; un producto que no
 * esté se pinta con su descripción o su id.
 */
export function buildPendingNegocioPreview(input: {
  negocioId: string;
  negocio: Record<string, unknown>;
  items: Record<string, unknown>[];
  productNames: Map<string, PendingProductName>;
}): PendingNegocioPreview {
  const { negocio, negocioId } = input;
  const items = input.items.map((raw, index) => {
    const productId = String(raw.product_id ?? '');
    const quantity = num(raw.quantity);
    const unitPrice = num(raw.unit_price);
    return {
      id: `${negocioId}:item:${index}`,
      quantity,
      description: str(raw.description),
      product_id: productId,
      unit_price: unitPrice,
      subtotal: raw.subtotal != null ? num(raw.subtotal) : quantity * unitPrice,
      warehouse: null,
      product: input.productNames.get(productId) ?? { name: null, sku: null },
    };
  });

  const cuotas: PendingNegocioCuota[] = [];
  const cuota = (installmentNumber: number, dueDate: string, amount: number): PendingNegocioCuota => ({
    id: `${negocioId}:cuota:${cuotas.length}`,
    negocio_id: negocioId,
    installment_number: installmentNumber,
    due_date: dueDate,
    amount,
    paid_amount: 0,
    late_fee_amount: 0,
    status: 'pendiente',
  });

  const schedule = parseDownPaymentSchedule(negocio.down_payment_schedule, {
    down_payment: negocio.down_payment as number | string | null | undefined,
    down_payment_date: negocio.down_payment_date as string | null | undefined,
  });
  for (const abono of schedule) {
    cuotas.push(cuota(0, abono.due_date, num(abono.amount)));
  }
  const count = Math.max(0, Math.trunc(num(negocio.installments_count)));
  const firstDue = str(negocio.first_due_date);
  if (count > 0 && firstDue && ISO_DATE.test(firstDue)) {
    const frequency = String(negocio.frequency ?? 'mensual');
    const amount = num(negocio.installment_amount);
    for (let i = 1; i <= count; i += 1) {
      cuotas.push(cuota(i, addFrequency(firstDue, frequency, i - 1), amount));
    }
  }

  const pick = (key: string) => (key in negocio ? { [key]: negocio[key] } : {});
  return {
    negocioFields: {
      ...pick('products_subtotal'),
      ...pick('interest_amount'),
      ...pick('down_payment'),
      ...pick('down_payment_date'),
      ...pick('down_payment_schedule'),
      ...pick('financed_amount'),
      ...pick('installments_count'),
      ...pick('installment_amount'),
      ...pick('frequency'),
      ...pick('first_due_date'),
      ...pick('formula_snapshot'),
      ...pick('notes'),
      ...pick('vereda_id'),
      ...pick('remission_id'),
      ...pick('source_delivery_order_id'),
    },
    items,
    cuotas,
  };
}
