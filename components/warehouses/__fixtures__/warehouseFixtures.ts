/** Datos de prueba con la forma EXACTA que devuelven las RPC (snake_case, numeric). */

type Raw = Record<string, unknown>;

export function rawWarehouse(overrides: Raw = {}): Raw {
  return {
    id: 'w-1',
    name: 'La Argentina',
    city: 'Pitalito',
    address: 'Cra 4 # 5-10',
    is_active: true,
    total_products: 12,
    total_units: '340.00',
    incoming_transfers: 2,
    incoming_units: '7.00',
    pending_dispatch: 1,
    is_manager: true,
    managers: ['Ana Bodega', 'Luis Pérez'],
    ...overrides,
  };
}

export function rawStockRow(overrides: Raw = {}): Raw {
  return {
    product_id: 'p-1',
    name: 'Lavadora LG',
    sku: 'LAV-01',
    barcode: '7701',
    quantity: '4.00',
    incoming: 2,
    ...overrides,
  };
}

export function rawHistoryRow(overrides: Raw = {}): Raw {
  return {
    key: 'ex:1',
    movement_type: 'exit',
    occurred_at: '2026-09-30T15:30:00Z',
    product_id: 'p-1',
    product_name: 'Lavadora LG',
    product_sku: 'LAV-01',
    quantity: '-2.00',
    stock_effect: -2,
    stock_after: '2.00',
    document_type: 'delivery_order',
    document_id: 'do-1',
    document_number: 'OE-2026-0042',
    detail: null,
    notes: null,
    user_id: 'u-1',
    user_name: 'Ana Bodega',
    is_cancelled: false,
    serials: ['SN-1'],
    ...overrides,
  };
}
