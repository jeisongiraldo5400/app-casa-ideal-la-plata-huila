import type { LocalOfflineOrder, LocalOfflineOrderLine } from '@/lib/offline/repositories/deliveryOrdersRepository';
import { buildNegocioOriginPayload } from '../negocioOrigin';
import {
  mapRemissionOriginRows,
  toDeliveryOrderOption,
  type RemissionOriginRow,
} from '../../infrastructure/services/negociosDeliveryOrdersService';
import {
  buildLocalOrderOption,
  buildLocalRemissionGroups,
  toPendingRemissionOption,
} from '../../infrastructure/services/negociosOfflineOrdersService';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

/**
 * El comando offline `create_negocio` manda el origen tal cual lo arma el
 * asistente: con la orden de la foto del teléfono tiene que salir EXACTAMENTE
 * lo mismo que con la del servidor, o el servidor vincularía otra cosa.
 */

const rpcRows: RemissionOriginRow[] = [
  {
    group_kind: 'own',
    source_delivery_order_id: 'rem-1',
    source_order_number: 'REM-0010',
    source_customer_id: null,
    source_customer_name: null,
    source_has_negocio: false,
    product_id: 'cama',
    product_name: 'Cama',
    warehouse_id: 'w1',
    warehouse_name: 'Principal',
    quantity: 5,
    available_quantity: 5,
  },
  {
    group_kind: 'child',
    source_delivery_order_id: 'oe-7',
    source_order_number: 'OE-0007',
    source_customer_id: 'c-ana',
    source_customer_name: 'ANA',
    source_has_negocio: false,
    product_id: 'colchon',
    product_name: 'Colchón',
    warehouse_id: 'w1',
    warehouse_name: 'Principal',
    quantity: 2,
    available_quantity: 2,
  },
];

const localLines: LocalOfflineOrderLine[] = rpcRows.map((row) => ({
  orderId: 'rem-1',
  groupKind: row.group_kind,
  sourceOrderId: row.source_delivery_order_id as string,
  sourceOrderNumber: row.source_order_number,
  sourceCustomerId: row.source_customer_id,
  sourceCustomerName: row.source_customer_name,
  sourceHasNegocio: row.source_has_negocio,
  productId: row.product_id,
  productName: row.product_name,
  productSku: null,
  warehouseId: row.warehouse_id,
  warehouseName: row.warehouse_name,
  quantity: row.quantity,
  availableQuantity: row.available_quantity,
}));

const localRemission: LocalOfflineOrder = {
  id: 'rem-1',
  orderNumber: 'REM-0010',
  orderType: 'remission',
  status: 'approved',
  customerId: null,
  customerName: null,
  municipioId: null,
  veredaId: null,
  deliveryAddress: null,
  createdAt: null,
  customerIdNumber: null,
  assignedUserName: null,
  zoneName: null,
  notes: null,
  usable: true,
  unusableReason: null,
  snapshotAt: 1,
};

const serverRemission = toDeliveryOrderOption(
  {
    id: 'rem-1',
    order_number: 'REM-0010',
    created_at: '2026-09-24',
    order_type: 'remission',
    status: 'approved',
    items: [{ product_id: 'cama', warehouse_id: 'w1', quantity: 5 }],
  },
  new Map()
)!;

const pick = <T extends { kind: string }>(groups: T[], kind: string) => groups.find((g) => g.kind === kind)!;

describe('origen del negocio · igual con señal y sin ella', () => {
  it('remisión, grupo propio', () => {
    const online = buildNegocioOriginPayload({
      originType: 'orden_entrega',
      deliveryMode: 'directo',
      targetRemissionId: null,
      selectedOrder: serverRemission,
      selectedGroup: pick(mapRemissionOriginRows('rem-1', rpcRows), 'own'),
    });
    const offline = buildNegocioOriginPayload({
      originType: 'orden_entrega',
      deliveryMode: 'directo',
      targetRemissionId: null,
      selectedOrder: buildLocalOrderOption(localRemission, localLines, new Map()),
      selectedGroup: pick(buildLocalRemissionGroups('rem-1', localLines, new Map()), 'own'),
    });

    expect(offline).toEqual(online);
    expect(offline).toEqual({ remission_id: 'rem-1', source_delivery_order_id: 'rem-1', target_remission_id: null });
  });

  it('remisión, OE de cliente anidada', () => {
    const online = buildNegocioOriginPayload({
      originType: 'orden_entrega',
      deliveryMode: 'directo',
      targetRemissionId: null,
      selectedOrder: serverRemission,
      selectedGroup: pick(mapRemissionOriginRows('rem-1', rpcRows), 'child'),
    });
    const offline = buildNegocioOriginPayload({
      originType: 'orden_entrega',
      deliveryMode: 'directo',
      targetRemissionId: null,
      selectedOrder: buildLocalOrderOption(localRemission, localLines, new Map()),
      selectedGroup: pick(buildLocalRemissionGroups('rem-1', localLines, new Map()), 'child'),
    });

    expect(offline).toEqual(online);
    expect(offline).toEqual({ remission_id: null, source_delivery_order_id: 'oe-7', target_remission_id: null });
  });

  it('OE de cliente suelta', () => {
    const online = buildNegocioOriginPayload({
      originType: 'orden_entrega',
      deliveryMode: 'directo',
      targetRemissionId: null,
      selectedOrder: toDeliveryOrderOption(
        {
          id: 'oe-9',
          order_number: 'OE-0009',
          created_at: '2026-09-24',
          order_type: 'customer',
          status: 'approved',
          items: [{ product_id: 'cama', warehouse_id: 'w1', quantity: 1 }],
        },
        new Map()
      ),
      selectedGroup: null,
    });
    const offline = buildNegocioOriginPayload({
      originType: 'orden_entrega',
      deliveryMode: 'directo',
      targetRemissionId: null,
      selectedOrder: buildLocalOrderOption(
        { ...localRemission, id: 'oe-9', orderNumber: 'OE-0009', orderType: 'customer' },
        [{ ...localLines[0], orderId: 'oe-9', groupKind: 'self', sourceOrderId: 'oe-9' }],
        new Map()
      ),
      selectedGroup: null,
    });

    expect(offline).toEqual(online);
    expect(offline).toEqual({ remission_id: null, source_delivery_order_id: 'oe-9', target_remission_id: null });
  });

  it('sacar de bodega y enviar en una remisión pendiente de la lista del teléfono', () => {
    const localTarget = toPendingRemissionOption({
      id: 'rem-2',
      orderNumber: 'REM-0020',
      status: 'pending',
      createdAt: null,
      assignedToUserId: null,
      assignedUserName: null,
      zoneName: null,
      notes: null,
      nestedOrdersCount: 0,
    });
    const offline = buildNegocioOriginPayload({
      originType: 'bodega',
      deliveryMode: 'remision',
      targetRemissionId: localTarget.id,
      selectedOrder: null,
      selectedGroup: null,
    });

    expect(offline).toEqual({ remission_id: null, source_delivery_order_id: null, target_remission_id: 'rem-2' });
    // Con retiro directo no se manda remisión destino aunque haya una elegida.
    expect(
      buildNegocioOriginPayload({
        originType: 'bodega',
        deliveryMode: 'directo',
        targetRemissionId: 'rem-2',
        selectedOrder: null,
        selectedGroup: null,
      }).target_remission_id
    ).toBeNull();
  });
});
