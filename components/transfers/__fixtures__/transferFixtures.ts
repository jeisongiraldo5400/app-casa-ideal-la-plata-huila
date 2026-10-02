/** Datos de prueba con la forma EXACTA que devuelven las RPC (snake_case, numeric). */

type RawOrder = Record<string, unknown>;
type RawItem = Record<string, unknown>;

export function rawOrder(overrides: RawOrder = {}): RawOrder {
  return {
    id: 't-1',
    order_number: 'TR-2026-0001',
    status: 'in_transit',
    source_warehouse: { id: 'w-src', name: 'Principal' },
    destination_warehouse: { id: 'w-dst', name: 'La Argentina' },
    carrier: { id: 'u-carrier', name: 'Darío' },
    created_by: { id: 'u-admin', name: 'Admin' },
    dispatched_by: { id: 'u-disp', name: 'Bodeguero' },
    // Asignados por el admin al crear (20261231470000).
    dispatcher: { id: 'u-disp', name: 'Bodeguero' },
    receiver: { id: 'u-recv', name: 'Recibe' },
    notes: null,
    created_at: '2026-09-26T14:00:00Z',
    updated_at: '2026-09-26T15:00:00Z',
    submitted_at: '2026-09-26T14:05:00Z',
    dispatched_at: '2026-09-26T15:00:00Z',
    due_at: '2026-09-28T15:00:00Z',
    received_at: null,
    closed_at: null,
    cancelled_at: null,
    cancel_reason: null,
    submit_override_reason: null,
    items_count: 2,
    total_quantity: '5.00',
    dispatched_quantity: 5,
    received_quantity: 0,
    damaged_quantity: 0,
    returned_quantity: 0,
    return_pending_quantity: 0,
    written_off_quantity: 0,
    in_transit_quantity: 5,
    pending_receipt_quantity: 5,
    is_overdue: false,
    ...overrides,
  };
}

export function rawItem(overrides: RawItem = {}): RawItem {
  return {
    id: 'i-1',
    product_id: 'p-1',
    product_name: 'Lavadora LG',
    product_sku: 'LAV-01',
    product_barcode: '770',
    quantity: 3,
    dispatched_quantity: 3,
    received_quantity: 0,
    damaged_quantity: 0,
    return_pending_quantity: 0,
    returned_quantity: 0,
    written_off_quantity: 0,
    in_transit_quantity: 3,
    pending_receipt_quantity: 3,
    available_at_source: 7,
    notes: null,
    has_serials: false,
    serials: [],
    ...overrides,
  };
}

export function rawDetail(options: {
  order?: RawOrder;
  items?: RawItem[];
  permissions?: Record<string, boolean>;
  events?: Record<string, unknown>[];
} = {}) {
  const order = rawOrder(options.order);
  const receiver = order.receiver as { id: string; name: string } | null;
  return {
    order,
    items: options.items ?? [
      rawItem(),
      rawItem({
        id: 'i-2',
        product_id: 'p-2',
        product_name: 'Nevera Haceb',
        product_sku: 'NEV-02',
        quantity: 2,
        dispatched_quantity: 2,
        in_transit_quantity: 2,
        pending_receipt_quantity: 2,
      }),
    ],
    events: options.events ?? [],
    // Siguen llegando para apps viejas; la app nueva usa `order.receiver`.
    receivers: receiver ? [receiver] : [],
    receivers_assigned: receiver !== null,
    receiver_options: [],
    permissions: {
      can_edit: false,
      can_submit: false,
      can_cancel: false,
      can_dispatch: false,
      can_receive: true,
      can_resolve: false,
      can_confirm_return: false,
      is_admin: false,
      ...options.permissions,
    },
  };
}

/** Traslado por despachar: nada ha salido todavía. */
export function rawPendingDispatchDetail(permissions: Record<string, boolean> = { can_dispatch: true, can_receive: false }) {
  return rawDetail({
    order: {
      status: 'pending_dispatch',
      dispatched_at: null,
      dispatched_by: null,
      due_at: null,
      dispatched_quantity: 0,
      in_transit_quantity: 0,
      pending_receipt_quantity: 0,
    },
    items: [
      rawItem({ dispatched_quantity: 0, in_transit_quantity: 0, pending_receipt_quantity: 0 }),
      rawItem({
        id: 'i-2',
        product_id: 'p-2',
        product_name: 'Nevera Haceb',
        product_sku: 'NEV-02',
        quantity: 2,
        dispatched_quantity: 0,
        in_transit_quantity: 0,
        pending_receipt_quantity: 0,
      }),
    ],
    permissions,
  });
}
