import type { CustomerNegocioItem, CustomerNegocioRole } from './customerNegocios';

/**
 * Lectura segura del jsonb de `get_customer_summary` y su equivalente local.
 *
 * El RPC devuelve `Json`, así que aquí se estrecha a tipos concretos sin usar
 * `any`. Las fórmulas del cálculo local replican las del SQL para que la ficha
 * sin conexión no contradiga a la ficha en línea.
 */

export type CustomerSummaryCustomer = {
  id: string;
  name: string;
  id_number: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  municipio_name: string | null;
  vereda_name: string | null;
  departamento_name: string | null;
  created_at: string | null;
  seller_id: string | null;
};

export type CustomerSummarySeller = {
  id: string;
  full_name: string;
  email: string | null;
  avatar_url: string | null;
};

export type CustomerSummaryPayment = {
  id: string;
  negocio_id: string;
  amount: number;
  paid_at: string | null;
  receipt_number: string | null;
};

export type CustomerSummaryCartera = {
  total_balance: number;
  overdue_balance: number;
  overdue_installments: number;
  next_due_date: string | null;
  next_due_amount: number;
  last_payment: CustomerSummaryPayment | null;
};

export type CustomerSummaryScope = {
  visible_negocios: number;
  /** Negocios del cliente que este usuario no puede ver; la deuda mostrada es parcial. */
  hidden_negocios: number;
};

export type CustomerSummary = {
  customer: CustomerSummaryCustomer | null;
  seller: CustomerSummarySeller | null;
  negocios: CustomerNegocioItem[];
  cartera: CustomerSummaryCartera;
  scope: CustomerSummaryScope;
};

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

const asText = (value: unknown): string | null => (typeof value === 'string' ? value : null);

/** El driver de Postgres puede devolver numeric como texto. */
const asNumber = (value: unknown): number => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const asRole = (value: unknown): CustomerNegocioRole => {
  if (value === 'codeudor') return 'codeudor';
  if (value === 'titular_y_codeudor') return 'titular_y_codeudor';
  return 'titular';
};

export const EMPTY_CARTERA: CustomerSummaryCartera = {
  total_balance: 0,
  overdue_balance: 0,
  overdue_installments: 0,
  next_due_date: null,
  next_due_amount: 0,
  last_payment: null,
};

function parseNegocios(value: unknown): CustomerNegocioItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): CustomerNegocioItem[] => {
    const row = asRecord(entry);
    const id = asText(row.negocio_id);
    if (!id) return [];
    return [
      {
        negocio_id: id,
        negocio_numero: asNumber(row.negocio_numero),
        status: asText(row.status) || 'borrador',
        deal_date: asText(row.deal_date),
        total_credit: asNumber(row.total_credit),
        remaining_balance: asNumber(row.remaining_balance),
        direccion: asText(row.direccion) || 'Dirección no registrada',
        municipio_name: asText(row.municipio_name),
        role_in_negocio: asRole(row.role_in_negocio),
        has_mora: row.has_mora === true,
      },
    ];
  });
}

function parsePayment(value: unknown): CustomerSummaryPayment | null {
  const row = asRecord(value);
  const id = asText(row.id);
  if (!id) return null;
  return {
    id,
    negocio_id: asText(row.negocio_id) || '',
    amount: asNumber(row.amount),
    paid_at: asText(row.paid_at),
    receipt_number: asText(row.receipt_number),
  };
}

export function parseCustomerSummary(raw: unknown): CustomerSummary {
  const root = asRecord(raw);
  const customerRow = asRecord(root.customer);
  const customerId = asText(customerRow.id);
  const sellerRow = asRecord(root.seller);
  const sellerId = asText(sellerRow.id);
  const carteraRow = asRecord(root.cartera);
  const scopeRow = asRecord(root.scope);

  return {
    customer: customerId
      ? {
          id: customerId,
          name: asText(customerRow.name) || 'Cliente',
          id_number: asText(customerRow.id_number),
          phone: asText(customerRow.phone),
          email: asText(customerRow.email),
          address: asText(customerRow.address),
          notes: asText(customerRow.notes),
          municipio_name: asText(customerRow.municipio_name),
          vereda_name: asText(customerRow.vereda_name),
          departamento_name: asText(customerRow.departamento_name),
          created_at: asText(customerRow.created_at),
          seller_id: asText(customerRow.seller_id),
        }
      : null,
    seller: sellerId
      ? {
          id: sellerId,
          full_name: asText(sellerRow.full_name) || asText(sellerRow.email) || 'Sin nombre',
          email: asText(sellerRow.email),
          avatar_url: asText(sellerRow.avatar_url),
        }
      : null,
    negocios: parseNegocios(root.negocios),
    cartera: {
      total_balance: asNumber(carteraRow.total_balance),
      overdue_balance: asNumber(carteraRow.overdue_balance),
      overdue_installments: asNumber(carteraRow.overdue_installments),
      next_due_date: asText(carteraRow.next_due_date),
      next_due_amount: asNumber(carteraRow.next_due_amount),
      last_payment: parsePayment(carteraRow.last_payment),
    },
    scope: {
      visible_negocios: asNumber(scopeRow.visible_negocios),
      hidden_negocios: asNumber(scopeRow.hidden_negocios),
    },
  };
}

export type LocalCuota = {
  dueDate: string;
  amount: number;
  paidAmount: number;
  lateFeeAmount: number;
  status: string;
};

export type LocalPago = {
  id: string;
  negocioId: string;
  amount: number;
  paidAt: string | null;
  receiptNumber: string | null;
  receiptStatus?: string | null;
};

const OPEN_STATUSES = new Set(['pendiente', 'parcial', 'mora']);

/**
 * Mismas fórmulas que `get_customer_summary`: el saldo nunca es negativo, el
 * vencido se decide por fecha (no por el estado guardado, que puede ir
 * atrasado) y los recibos anulados no cuentan como último pago.
 */
export function summarizeCustomerCarteraLocal(
  cuotas: LocalCuota[],
  pagos: LocalPago[],
  today: string
): CustomerSummaryCartera {
  const abiertas = cuotas
    .filter((cuota) => OPEN_STATUSES.has(cuota.status))
    .map((cuota) => ({
      dueDate: cuota.dueDate,
      saldo: Math.max(cuota.amount + (cuota.lateFeeAmount || 0) - cuota.paidAmount, 0),
    }));

  const vencidas = abiertas.filter((cuota) => cuota.dueDate < today);
  const futuras = abiertas.filter((cuota) => cuota.dueDate >= today && cuota.saldo > 0);
  const nextDueDate = futuras.reduce<string | null>(
    (min, cuota) => (min === null || cuota.dueDate < min ? cuota.dueDate : min),
    null
  );

  const ultimoPago = pagos
    .filter((pago) => (pago.receiptStatus || 'emitido') !== 'anulado')
    .sort((a, b) => (b.paidAt || '').localeCompare(a.paidAt || ''))[0];

  return {
    total_balance: abiertas.reduce((sum, cuota) => sum + cuota.saldo, 0),
    overdue_balance: vencidas.reduce((sum, cuota) => sum + cuota.saldo, 0),
    overdue_installments: vencidas.filter((cuota) => cuota.saldo > 0).length,
    next_due_date: nextDueDate,
    next_due_amount: nextDueDate
      ? futuras.filter((cuota) => cuota.dueDate === nextDueDate).reduce((sum, cuota) => sum + cuota.saldo, 0)
      : 0,
    last_payment: ultimoPago
      ? {
          id: ultimoPago.id,
          negocio_id: ultimoPago.negocioId,
          amount: ultimoPago.amount,
          paid_at: ultimoPago.paidAt,
          receipt_number: ultimoPago.receiptNumber,
        }
      : null,
  };
}
