export type LocalCustomerRow = {
  id: string;
  name: string;
  idNumber: string | null;
  phone: string | null;
};

export type LocalNegocioRow = {
  id: string;
  numero: number;
  status: string;
  dealDate: string | null;
  totalCredit: number;
  remainingBalance: number;
  customerId: string;
  codeudorCustomerId: string | null;
  direccion: string | null;
  municipioId: string | null;
  municipioName: string | null;
  sellerId: string | null;
};

export type LocalCuotaRow = {
  id: string;
  negocioId: string;
  installmentNumber: number;
  dueDate: string;
  amount: number;
  paidAmount: number;
  lateFeeAmount: number;
  status: string;
};

export type LocalPagoRow = {
  id: string;
  negocioId: string;
  cuotaId: string | null;
  amount: number;
  paidAt: string;
  receiptNumber: string | null;
  virtualReceiptNumber: string | null;
  receiptStatus: string;
  notes: string | null;
  createdByName?: string | null;
};

export type LocalNegocioListItem = {
  id: string;
  numero: number;
  status: string;
  deal_date: string | null;
  total_credit: number;
  remaining_balance: number;
  customer_id: string;
  customer: { name: string };
  installments_count: number | null;
  delivery_order_id: string | null;
};

export type LocalNegocioDetail = {
  negocio: {
    id: string;
    numero: number;
    status: string;
    deal_date: string | null;
    total_credit: number;
    remaining_balance: number;
    customer_id: string;
    codeudor_customer_id: string | null;
    direccion: string | null;
    municipio_id: string | null;
    seller_id: string | null;
    delivery_order_id: null;
    customer_signature_url: null;
    guarantor_signature_url: null;
    seller_signature_url: null;
    municipio: { nombre: string | null; departamento: { nombre: null } };
  };
  customer: {
    name: string;
    id_number: string | null;
    phone: string | null;
    email: null;
    address: null;
  };
  codeudor: {
    name: string;
    id_number: string | null;
    phone: string | null;
    email: null;
    address: null;
  } | null;
  cuotas: Array<{
    id: string;
    negocio_id: string;
    installment_number: number;
    due_date: string;
    amount: number;
    paid_amount: number;
    late_fee_amount: number;
    status: string;
  }>;
  pagos: Array<{
    id: string;
    negocio_id: string;
    cuota_id: string | null;
    amount: number;
    paid_at: string;
    receipt_number: string | null;
    virtual_receipt_number: string | null;
    receipt_status: string;
    notes: string | null;
    created_by_name: string | null;
  }>;
};

function cuotaSaldo(cuota: LocalCuotaRow) {
  return Math.max(cuota.amount + cuota.lateFeeAmount - cuota.paidAmount, 0);
}

/**
 * Saldo derivado de las cuotas locales. Solo se usa el valor guardado en el
 * negocio cuando no hay ninguna cuota descargada; un negocio con cuotas
 * totalmente pagadas debe mostrar 0, no el saldo viejo.
 */
export function remainingForNegocio(negocio: LocalNegocioRow, cuotas: LocalCuotaRow[]) {
  const related = cuotas.filter((cuota) => cuota.negocioId === negocio.id);
  if (!related.length) return negocio.remainingBalance;
  return related
    .filter((cuota) => cuota.status !== 'anulada')
    .reduce((sum, cuota) => sum + cuotaSaldo(cuota), 0);
}

export function mapNegociosListFromLocal(
  negocios: LocalNegocioRow[],
  customers: LocalCustomerRow[],
  cuotas: LocalCuotaRow[]
): LocalNegocioListItem[] {
  const customerById = new Map(customers.map((row) => [row.id, row]));
  return [...negocios]
    .sort((a, b) => b.numero - a.numero)
    .map((negocio) => {
      const customer = customerById.get(negocio.customerId);
      return {
        id: negocio.id,
        numero: negocio.numero,
        status: negocio.status,
        deal_date: negocio.dealDate,
        total_credit: negocio.totalCredit,
        remaining_balance: remainingForNegocio(negocio, cuotas),
        customer_id: negocio.customerId,
        customer: { name: customer?.name || 'Cliente' },
        installments_count: null,
        delivery_order_id: null,
      };
    });
}

export function mapNegocioDetailFromLocal(input: {
  negocio: LocalNegocioRow;
  customers: LocalCustomerRow[];
  cuotas: LocalCuotaRow[];
  pagos: LocalPagoRow[];
}): LocalNegocioDetail {
  const customerById = new Map(input.customers.map((row) => [row.id, row]));
  const customer = customerById.get(input.negocio.customerId);
  const codeudor = input.negocio.codeudorCustomerId
    ? customerById.get(input.negocio.codeudorCustomerId)
    : undefined;
  const relatedCuotas = input.cuotas
    .filter((cuota) => cuota.negocioId === input.negocio.id)
    .sort((a, b) => a.installmentNumber - b.installmentNumber);
  const relatedPagos = input.pagos
    .filter((pago) => pago.negocioId === input.negocio.id)
    .sort((a, b) => b.paidAt.localeCompare(a.paidAt));

  return {
    negocio: {
      id: input.negocio.id,
      numero: input.negocio.numero,
      status: input.negocio.status,
      deal_date: input.negocio.dealDate,
      total_credit: input.negocio.totalCredit,
      remaining_balance: remainingForNegocio(input.negocio, relatedCuotas),
      customer_id: input.negocio.customerId,
      codeudor_customer_id: input.negocio.codeudorCustomerId,
      direccion: input.negocio.direccion,
      municipio_id: input.negocio.municipioId,
      seller_id: input.negocio.sellerId,
      delivery_order_id: null,
      customer_signature_url: null,
      guarantor_signature_url: null,
      seller_signature_url: null,
      municipio: {
        nombre: input.negocio.municipioName,
        departamento: { nombre: null },
      },
    },
    customer: {
      name: customer?.name || 'Cliente',
      id_number: customer?.idNumber || null,
      phone: customer?.phone || null,
      email: null,
      address: null,
    },
    codeudor: codeudor
      ? {
          name: codeudor.name,
          id_number: codeudor.idNumber,
          phone: codeudor.phone,
          email: null,
          address: null,
        }
      : null,
    cuotas: relatedCuotas.map((cuota) => ({
      id: cuota.id,
      negocio_id: cuota.negocioId,
      installment_number: cuota.installmentNumber,
      due_date: cuota.dueDate,
      amount: cuota.amount,
      paid_amount: cuota.paidAmount,
      late_fee_amount: cuota.lateFeeAmount,
      status: cuota.status,
    })),
    pagos: relatedPagos.map((pago) => ({
      id: pago.id,
      negocio_id: pago.negocioId,
      cuota_id: pago.cuotaId,
      amount: pago.amount,
      paid_at: pago.paidAt,
      receipt_number: pago.receiptNumber,
      virtual_receipt_number: pago.virtualReceiptNumber,
      receipt_status: pago.receiptStatus,
      notes: pago.notes,
      created_by_name: pago.createdByName ?? null,
    })),
  };
}
