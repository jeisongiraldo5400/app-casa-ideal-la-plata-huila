import type { NegocioReceiptData } from '@/lib/negocioReceiptHtml';
import { paymentSiteLabel } from '@/lib/paymentSite';
import type { MisCobroRow } from './misCobros';

/**
 * Datos del recibo de un cobro de «Cobros», para compartirlo en PDF o
 * reimprimirlo. Solo los pagos que ya confirmó el servidor tienen recibo
 * virtual y saldo del negocio: para los del teléfono devuelve null.
 */
export function cobroReceiptData(row: MisCobroRow): NegocioReceiptData | null {
  if (row.local_state || !row.virtual_receipt_number || row.remaining_balance == null) return null;
  return {
    receiptNumber: row.virtual_receipt_number,
    status: row.receipt_status,
    paidAt: row.paid_at,
    amount: Number(row.amount),
    physicalReceiptNumber: row.receipt_number,
    negocioNumero: row.negocio_numero,
    customerName: row.customer_name,
    registeredBy: row.created_by_name ?? null,
    paymentMethodName: row.payment_method_name,
    paymentSiteName: paymentSiteLabel(row.payment_site),
    remainingBalance: Number(row.remaining_balance),
    paymentKind: row.payment_kind ?? null,
    discountAmount: row.discount_amount ?? null,
    discountReason: row.discount_reason ?? null,
    expectedTotal: row.expected_total ?? null,
  };
}
