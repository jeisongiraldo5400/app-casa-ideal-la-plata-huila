const DATE_VALUE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * La cuota inicial ya no se registra como pago al activar: es una obligación
 * pendiente (cuota 0) con fecha de vencimiento propia. Si hay cuota inicial,
 * la fecha es obligatoria y no puede ser anterior a la fecha del negocio.
 * Misma regla que `assert_negocio_down_payment` en la base de datos y que
 * `negocioCreditRules.ts` del panel web.
 */
export function downPaymentDateError(
  downPayment: number,
  downPaymentDate: string,
  dealDate: string
): string | null {
  if (!(Number(downPayment) > 0)) return null;
  if (!DATE_VALUE.test(downPaymentDate)) {
    return 'Indique la fecha de pago de la cuota inicial';
  }
  if (DATE_VALUE.test(dealDate) && downPaymentDate < dealDate) {
    return 'La fecha de pago de la cuota inicial no puede ser anterior a la fecha del negocio';
  }
  return null;
}
