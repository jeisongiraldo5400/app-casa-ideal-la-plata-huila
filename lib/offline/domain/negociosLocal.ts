export type LocalCustomerRow = {
  id: string;
  name: string;
  idNumber: string | null;
  phone: string | null;
  /** Contacto de la ficha, descargado desde la v8 del esquema local. */
  email?: string | null;
  address?: string | null;
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
  gestorCobroId?: string | null;
  /** Nombres ya resueltos en el pull; null en filas anteriores a la v8. */
  sellerName?: string | null;
  gestorCobroName?: string | null;
};

/** Producto de un negocio guardado en el teléfono. */
export type LocalNegocioItemRow = {
  id: string;
  negocioId: string;
  productId: string;
  productName: string | null;
  productSku: string | null;
  warehouseId: string | null;
  description: string | null;
  quantity: number;
  unitPrice: number;
  subtotal: number;
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
  paymentMethodName?: string | null;
  paymentSite?: string | null;
  paymentKind?: string | null;
  discountAmount?: number | null;
  discountReason?: string | null;
  expectedTotal?: number | null;
};

export type LocalNegocioListItem = {
  id: string;
  numero: number;
  status: string;
  deal_date: string | null;
  total_credit: number;
  remaining_balance: number;
  customer_id: string;
  /** `id_number` para poder buscar por documento sin señal, igual que en línea. */
  customer: { name: string; id_number: string | null };
  installments_count: number | null;
  /** Se deriva de las cuotas locales; antes iba en null y «En mora» salía vacío. */
  has_mora: boolean;
  delivery_order_id: string | null;
  seller_id: string | null;
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
    gestor_cobro_id: string | null;
    /** Nombres resueltos en el pull; la pantalla ya no tiene que preguntar a `profiles`. */
    seller_name: string | null;
    gestor_cobro_name: string | null;
    /** Suma de los subtotales locales, para la tarjeta de productos. */
    products_subtotal: number;
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
    email: string | null;
    address: string | null;
  };
  codeudor: {
    name: string;
    id_number: string | null;
    phone: string | null;
    email: string | null;
    address: string | null;
  } | null;
  /** Productos del negocio; vacío si el pull todavía no los trajo. */
  items: Array<{
    id: string;
    quantity: number;
    description: string | null;
    product_id: string;
    unit_price: number;
    subtotal: number;
    product: { name: string | null; sku: string | null };
  }>;
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
    payment_method_name: string | null;
    payment_site: string | null;
    payment_kind: string | null;
    discount_amount: number | null;
    discount_reason: string | null;
    expected_total: number | null;
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
  // Un índice por negocio evita recorrer todas las cuotas por cada fila: con el
  // directorio completo descargado la lista pasó a ser larga de verdad.
  const cuotasByNegocio = new Map<string, LocalCuotaRow[]>();
  for (const cuota of cuotas) {
    const current = cuotasByNegocio.get(cuota.negocioId);
    if (current) current.push(cuota);
    else cuotasByNegocio.set(cuota.negocioId, [cuota]);
  }
  return [...negocios]
    .sort((a, b) => b.numero - a.numero)
    .map((negocio) => {
      const customer = customerById.get(negocio.customerId);
      const relatedCuotas = cuotasByNegocio.get(negocio.id) || [];
      // Mismo criterio que en línea (`negociosStore`): basta una cuota en mora.
      // Las anuladas no cuentan ni para el filtro ni para el número de cuotas.
      const vigentes = relatedCuotas.filter((cuota) => cuota.status !== 'anulada');
      return {
        id: negocio.id,
        numero: negocio.numero,
        status: negocio.status,
        deal_date: negocio.dealDate,
        total_credit: negocio.totalCredit,
        remaining_balance: remainingForNegocio(negocio, relatedCuotas),
        customer_id: negocio.customerId,
        customer: { name: customer?.name || 'Cliente', id_number: customer?.idNumber || null },
        installments_count: vigentes.length || null,
        has_mora: relatedCuotas.some((cuota) => cuota.status === 'mora'),
        delivery_order_id: null,
        seller_id: negocio.sellerId,
      };
    });
}

export function mapNegocioDetailFromLocal(input: {
  negocio: LocalNegocioRow;
  customers: LocalCustomerRow[];
  cuotas: LocalCuotaRow[];
  pagos: LocalPagoRow[];
  items?: LocalNegocioItemRow[];
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
  const relatedItems = (input.items || []).filter((item) => item.negocioId === input.negocio.id);

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
      gestor_cobro_id: input.negocio.gestorCobroId ?? null,
      seller_name: input.negocio.sellerName ?? null,
      gestor_cobro_name: input.negocio.gestorCobroName ?? null,
      products_subtotal: relatedItems.reduce((sum, item) => sum + item.subtotal, 0),
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
      email: customer?.email ?? null,
      address: customer?.address ?? null,
    },
    codeudor: codeudor
      ? {
          name: codeudor.name,
          id_number: codeudor.idNumber,
          phone: codeudor.phone,
          email: codeudor.email ?? null,
          address: codeudor.address ?? null,
        }
      : null,
    items: relatedItems.map((item) => ({
      id: item.id,
      quantity: item.quantity,
      description: item.description,
      product_id: item.productId,
      unit_price: item.unitPrice,
      subtotal: item.subtotal,
      // La bodega no se descarga por nombre: la tarjeta la pinta como «—».
      product: { name: item.productName, sku: item.productSku },
    })),
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
      payment_method_name: pago.paymentMethodName ?? null,
      payment_site: pago.paymentSite ?? null,
      payment_kind: pago.paymentKind ?? null,
      discount_amount: pago.discountAmount ?? null,
      discount_reason: pago.discountReason ?? null,
      expected_total: pago.expectedTotal ?? null,
    })),
  };
}
