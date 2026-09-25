import type {
  LocalOfflineOrder,
  LocalOfflineOrderLine,
} from '@/lib/offline/repositories/deliveryOrdersRepository';
import {
  getLocalOfflineOrderLines,
  listLocalOfflineOrders,
  listLocalPendingRemissions,
  pendingLocalQuantitiesByOrigin,
} from '@/lib/offline/repositories/deliveryOrdersRepository';
import {
  TOMADO_POR_NEGOCIOS_LOCALES,
  buildLocalOrderOption,
  buildLocalRemissionGroups,
  fetchLocalPendingRemissions,
  fetchLocalRemissionOriginGroups,
  pendingOriginKey,
  searchLocalOfflineOrders,
} from '../negociosOfflineOrdersService';
import { REMISSION_OWN_GROUP_LABEL, formatDeliveryOrderOptionMeta } from '../negociosDeliveryOrdersService';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

jest.mock('@/lib/offline/repositories/deliveryOrdersRepository', () => ({
  listLocalOfflineOrders: jest.fn(),
  getLocalOfflineOrderLines: jest.fn(),
  listLocalPendingRemissions: jest.fn(),
  localOrdersSnapshotAt: jest.fn(),
  pendingLocalQuantitiesByOrigin: jest.fn(),
}));

const line = (overrides: Partial<LocalOfflineOrderLine>): LocalOfflineOrderLine => ({
  orderId: 'rem-1',
  groupKind: 'own',
  sourceOrderId: 'rem-1',
  sourceOrderNumber: 'REM-0010',
  sourceCustomerId: null,
  sourceCustomerName: null,
  sourceHasNegocio: false,
  productId: 'cama',
  productName: 'Cama doble',
  productSku: 'CD-1',
  warehouseId: 'w1',
  warehouseName: 'Principal',
  quantity: 5,
  availableQuantity: 5,
  ...overrides,
});

const remission: LocalOfflineOrder = {
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
  snapshotAt: 1_000,
};

/** Remisión del camión: 5 camas propias, una OE hija con 2 colchones y otra ya con negocio. */
const remissionLines = [
  line({}),
  line({ productId: 'nevera', productName: 'Nevera', quantity: 1, availableQuantity: 1 }),
  line({
    groupKind: 'child',
    sourceOrderId: 'oe-7',
    sourceOrderNumber: 'OE-0007',
    sourceCustomerId: 'c-ana',
    sourceCustomerName: 'ANA',
    productId: 'colchon',
    productName: 'Colchón',
    quantity: 2,
    availableQuantity: 2,
  }),
  line({
    groupKind: 'child',
    sourceOrderId: 'oe-8',
    sourceOrderNumber: 'OE-0008',
    sourceCustomerId: 'c-luis',
    sourceCustomerName: 'LUIS',
    sourceHasNegocio: true,
    productId: 'mesa',
    productName: 'Mesa',
    quantity: 1,
    availableQuantity: 0,
  }),
];

describe('órdenes llevadas en el teléfono · armado sin señal', () => {
  beforeEach(() => jest.clearAllMocks());

  it('arma los grupos de la remisión desde la foto restando lo tomado por negocios locales sin enviar', () => {
    const pending = new Map([
      [pendingOriginKey('rem-1', 'cama', 'w1'), 3],
      [pendingOriginKey('rem-1', 'nevera', 'w1'), 1],
      [pendingOriginKey('oe-7', 'colchon', 'w1'), 1],
      // Otra bodega: no cuenta para esta línea.
      [pendingOriginKey('rem-1', 'cama', 'w2'), 4],
    ]);

    const groups = buildLocalRemissionGroups('rem-1', remissionLines, pending);

    expect(groups.map((g) => [g.kind, g.sourceOrderId])).toEqual([
      ['own', 'rem-1'],
      ['child', 'oe-7'],
      ['child', 'oe-8'],
    ]);
    const [own, child, withNegocio] = groups;
    expect(own.label).toBe(REMISSION_OWN_GROUP_LABEL);
    // La nevera quedó en 0 y se descarta; quedan 2 camas.
    expect(own.items).toEqual([
      expect.objectContaining({ product_id: 'cama', quantity: 5, available_quantity: 2 }),
    ]);
    expect(child).toEqual(
      expect.objectContaining({
        customerId: 'c-ana',
        hasNegocio: false,
        items: [expect.objectContaining({ product_id: 'colchon', available_quantity: 1 })],
      })
    );
    expect(withNegocio.hasNegocio).toBe(true);
  });

  it('nunca deja disponible negativo', () => {
    const pending = new Map([[pendingOriginKey('rem-1', 'cama', 'w1'), 9]]);
    const groups = buildLocalRemissionGroups('rem-1', [line({})], pending);
    expect(groups).toEqual([]);
  });

  it('una OE de cliente toma sus propias líneas y se marca sin disponible si ya se usó todo', () => {
    const order: LocalOfflineOrder = {
      ...remission,
      id: 'oe-9',
      orderNumber: 'OE-0009',
      orderType: 'customer',
      customerId: 'c-marta',
      customerName: 'MARTA',
      deliveryAddress: '  Vereda El Tigre  ',
    };
    const lines = [line({ orderId: 'oe-9', groupKind: 'self', sourceOrderId: 'oe-9', quantity: 2, availableQuantity: 2 })];

    const free = buildLocalOrderOption(order, lines, new Map());
    expect(free).toEqual(
      expect.objectContaining({
        id: 'oe-9',
        order_type: 'customer',
        customer_id: 'c-marta',
        delivery_address: 'Vereda El Tigre',
        from_local: true,
        unusable_reason: null,
        items: [expect.objectContaining({ product_id: 'cama', available_quantity: 2 })],
      })
    );

    const used = buildLocalOrderOption(order, lines, new Map([[pendingOriginKey('oe-9', 'cama', 'w1'), 2]]));
    expect(used.items).toEqual([]);
    expect(used.unusable_reason).toBe(TOMADO_POR_NEGOCIOS_LOCALES);
  });

  it('muestra el motivo del servidor cuando la orden ya no sirve', () => {
    const option = buildLocalOrderOption(
      { ...remission, usable: false, unusableReason: 'La remisión fue cancelada' },
      remissionLines,
      new Map()
    );
    expect(option.unusable_reason).toBe('La remisión fue cancelada');
  });

  it('busca en las órdenes llevadas por número o cliente, sin tildes, y da la hora de la foto', async () => {
    const customerOrder: LocalOfflineOrder = {
      ...remission,
      id: 'oe-9',
      orderNumber: 'OE-0009',
      orderType: 'customer',
      customerName: 'MARÍA LÓPEZ',
      snapshotAt: 2_000,
    };
    (listLocalOfflineOrders as jest.Mock).mockResolvedValue([remission, customerOrder]);
    (pendingLocalQuantitiesByOrigin as jest.Mock).mockResolvedValue(new Map());
    (getLocalOfflineOrderLines as jest.Mock).mockImplementation(async (id: string) =>
      id === 'rem-1'
        ? remissionLines
        : [line({ orderId: 'oe-9', groupKind: 'self', sourceOrderId: 'oe-9' })]
    );

    const all = await searchLocalOfflineOrders('');
    expect(all.orders.map((o) => o.id)).toEqual(['oe-9', 'rem-1']);
    expect(all.snapshotAt).toBe(2_000);

    const byName = await searchLocalOfflineOrders('maria lopez');
    expect(byName.orders.map((o) => o.id)).toEqual(['oe-9']);

    const byNumber = await searchLocalOfflineOrders('rem-00');
    expect(byNumber.orders.map((o) => o.id)).toEqual(['rem-1']);
  });

  it('los grupos de una remisión llevada leen la foto y lo pendiente local', async () => {
    (getLocalOfflineOrderLines as jest.Mock).mockResolvedValue(remissionLines);
    (pendingLocalQuantitiesByOrigin as jest.Mock).mockResolvedValue(
      new Map([[pendingOriginKey('rem-1', 'cama', 'w1'), 5]])
    );

    const groups = await fetchLocalRemissionOriginGroups('rem-1');

    expect(getLocalOfflineOrderLines).toHaveBeenCalledWith('rem-1');
    expect(groups[0].items.map((i) => i.product_id)).toEqual(['nevera']);
  });

  it('la lista ligera de remisiones pendientes tiene la forma de la de con señal', async () => {
    (listLocalPendingRemissions as jest.Mock).mockResolvedValue([
      {
        id: 'rem-2',
        orderNumber: 'REM-0020',
        status: 'pending',
        createdAt: '2026-09-24T10:00:00Z',
        assignedToUserId: 'u-chofer',
        assignedUserName: 'PEDRO',
        zoneName: 'Oriente',
        notes: 'Sale el jueves',
        nestedOrdersCount: 3,
      },
    ]);

    await expect(fetchLocalPendingRemissions()).resolves.toEqual([
      {
        id: 'rem-2',
        order_number: 'REM-0020',
        assigned_to_user_id: 'u-chofer',
        assigned_user_name: 'PEDRO',
        zone_name: 'Oriente',
        created_at: '2026-09-24T10:00:00Z',
        notes: 'Sale el jueves',
      },
    ]);
  });

  it('la tarjeta sin señal lleva la fecha, el documento y el asesor que mandó el servidor', () => {
    const order: LocalOfflineOrder = {
      ...remission,
      id: 'oe-9',
      orderNumber: 'OE-0009',
      orderType: 'customer',
      customerId: 'c-marta',
      customerName: 'MARTA',
      createdAt: '2026-09-20T15:30:00Z',
      customerIdNumber: '1036000111',
      assignedUserName: 'LUIS',
    };
    const option = buildLocalOrderOption(
      order,
      [line({ orderId: 'oe-9', groupKind: 'self', sourceOrderId: 'oe-9' })],
      new Map()
    );
    expect(option).toMatchObject({
      created_at: '2026-09-20T15:30:00Z',
      customer_id_number: '1036000111',
      assigned_user_name: 'LUIS',
    });
    expect(formatDeliveryOrderOptionMeta(option)).toBe('20/09/2026 · Doc. 1036000111');
    // Sin fecha ni documento (foto de un servidor anterior) no hay segunda línea.
    expect(formatDeliveryOrderOptionMeta(buildLocalOrderOption(remission, remissionLines, new Map()))).toBe('');
  });

  it('busca también por documento del cliente y por asesor asignado', async () => {
    const customerOrder: LocalOfflineOrder = {
      ...remission,
      id: 'oe-9',
      orderNumber: 'OE-0009',
      orderType: 'customer',
      customerName: 'MARTA',
      customerIdNumber: '1036000111',
    };
    const truck: LocalOfflineOrder = { ...remission, assignedUserName: 'PEDRO PÉREZ' };
    (listLocalOfflineOrders as jest.Mock).mockResolvedValue([truck, customerOrder]);
    (pendingLocalQuantitiesByOrigin as jest.Mock).mockResolvedValue(new Map());
    (getLocalOfflineOrderLines as jest.Mock).mockImplementation(async (id: string) =>
      id === 'rem-1' ? remissionLines : [line({ orderId: 'oe-9', groupKind: 'self', sourceOrderId: 'oe-9' })]
    );

    expect((await searchLocalOfflineOrders('1036000')).orders.map((o) => o.id)).toEqual(['oe-9']);
    expect((await searchLocalOfflineOrders('pedro perez')).orders.map((o) => o.id)).toEqual(['rem-1']);
  });
});
