import type { NegocioReceiptData } from '@/lib/negocioReceiptHtml';
import { paymentSiteLabel } from '@/lib/paymentSite';
import type { MisCobroRow } from './misCobros';

/**
 * Saldo que imprime el recibo: el que quedó tras ese pago, como el detalle
 * del negocio (`remainingAfterPago`). Un servidor sin 20261220120000 no lo
 * manda y se usa el saldo de hoy, que era lo que se imprimía antes.
 */
export function cobroReceiptBalance(row: Pick<MisCobroRow, 'remaining_after_payment' | 'remaining_balance'>): number | null {
  if (row.remaining_after_payment != null) return Number(row.remaining_after_payment);
  if (row.remaining_balance != null) return Number(row.remaining_balance);
  return null;
}

/**
 * Datos del recibo de un cobro de «Cobros», para compartirlo en PDF o
 * reimprimirlo. Solo los pagos que ya confirmó el servidor tienen recibo
 * virtual y saldo del negocio: para los del teléfono devuelve null.
 */
export function cobroReceiptData(row: MisCobroRow): NegocioReceiptData | null {
  const remainingBalance = cobroReceiptBalance(row);
  if (row.local_state || !row.virtual_receipt_number || remainingBalance == null) return null;
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
    remainingBalance,
    paymentKind: row.payment_kind ?? null,
    discountAmount: row.discount_amount ?? null,
    discountReason: row.discount_reason ?? null,
    expectedTotal: row.expected_total ?? null,
  };
}
