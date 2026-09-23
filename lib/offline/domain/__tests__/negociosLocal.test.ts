import { mapNegocioDetailFromLocal, mapNegociosListFromLocal } from '../negociosLocal';
import { matchesNegocioListFilter, matchesNegocioListQuery } from '@/lib/negocios/negocioListFilters';

const customers = [
  { id: 'c1', name: 'Ana Pérez', idNumber: '111', phone: '300' },
  { id: 'c2', name: 'Luis Gómez', idNumber: '222', phone: null },
];

const negocios = [
  {
    id: 'n1',
    numero: 12,
    status: 'activo',
    dealDate: '2026-08-01',
    totalCredit: 1000,
    remainingBalance: 200,
    customerId: 'c1',
    codeudorCustomerId: 'c2',
    direccion: 'Calle 1',
    municipioId: 'm1',
    municipioName: 'Cali',
    sellerId: 's1',
  },
  {
    id: 'n2',
    numero: 20,
    status: 'activo',
    dealDate: '2026-08-10',
    totalCredit: 500,
    remainingBalance: 500,
    customerId: 'c1',
    codeudorCustomerId: null,
    direccion: null,
    municipioId: null,
    municipioName: null,
    sellerId: null,
  },
];

const cuotas = [
  {
    id: 'q1',
    negocioId: 'n1',
    installmentNumber: 1,
    dueDate: '2026-08-15',
    amount: 100,
    paidAmount: 40,
    lateFeeAmount: 10,
    status: 'parcial',
  },
  {
    id: 'q2',
    negocioId: 'n1',
    installmentNumber: 2,
    dueDate: '2026-09-15',
    amount: 100,
    paidAmount: 0,
    lateFeeAmount: 0,
    status: 'pendiente',
  },
];

const pagos = [
  {
    id: 'p1',
    negocioId: 'n1',
    cuotaId: 'q1',
    amount: 40,
    paidAt: '2026-08-12T10:00:00Z',
    receiptNumber: null,
    virtualReceiptNumber: 'VR-1',
    receiptStatus: 'emitido',
    notes: null,
  },
];

describe('mapNegociosListFromLocal', () => {
  it('une cliente y saldo y omite campos que no están en el schema local', () => {
    const list = mapNegociosListFromLocal(negocios, customers, cuotas);
    expect(list[0].numero).toBe(20);
    expect(list[1].customer.name).toBe('Ana Pérez');
    expect(list[1].remaining_balance).toBe(170);
    // Las cuotas locales ya dan el número de cuotas; solo queda en null el
    // negocio que todavía no tiene ninguna descargada.
    expect(list[1].installments_count).toBe(2);
    expect(list[0].installments_count).toBeNull();
    expect(list[1].delivery_order_id).toBeNull();
    expect(list[1].seller_id).toBe('s1');
    expect(list[0].seller_id).toBeNull();
  });

  it('marca la mora desde las cuotas locales: el filtro «En mora» ya no sale vacío', () => {
    const conMora = [...cuotas, { ...cuotas[1], id: 'q3', negocioId: 'n2', status: 'mora' }];
    const list = mapNegociosListFromLocal(negocios, customers, conMora);
    const byId = new Map(list.map((item) => [item.id, item]));
    expect(byId.get('n2')?.has_mora).toBe(true);
    expect(byId.get('n1')?.has_mora).toBe(false);
    expect(list.filter((item) => matchesNegocioListFilter(item, 'overdue')).map((item) => item.id)).toEqual(['n2']);
  });

  it('lleva el documento del cliente para poder buscarlo sin señal', () => {
    const list = mapNegociosListFromLocal(negocios, customers, cuotas);
    const n1 = list.find((item) => item.id === 'n1')!;
    expect(n1.customer.id_number).toBe('111');
    // Con puntos o sin ellos: el documento se compara por sus dígitos.
    expect(matchesNegocioListQuery(n1, '111')).toBe(true);
    expect(matchesNegocioListQuery(n1, '1.11')).toBe(true);
    expect(matchesNegocioListQuery(n1, '999')).toBe(false);
  });
});

describe('mapNegocioDetailFromLocal', () => {
  it('arma cabecera, cliente, codeudor, cuotas y pagos', () => {
    const detail = mapNegocioDetailFromLocal({
      negocio: negocios[0],
      customers,
      cuotas,
      pagos,
    });
    expect(detail.negocio.numero).toBe(12);
    expect(detail.negocio.municipio.nombre).toBe('Cali');
    expect(detail.customer.name).toBe('Ana Pérez');
    expect(detail.codeudor?.name).toBe('Luis Gómez');
    expect(detail.cuotas).toHaveLength(2);
    expect(detail.pagos[0].virtual_receipt_number).toBe('VR-1');
    expect(detail.negocio.delivery_order_id).toBeNull();
  });

  it('conserva el gestor asignado y los campos del pronto pago para el detalle sin red', () => {
    const detail = mapNegocioDetailFromLocal({
      negocio: { ...negocios[0], gestorCobroId: 'g1' },
      customers,
      cuotas,
      pagos: [
        {
          ...pagos[0],
          paymentKind: 'pronto_pago',
          discountAmount: 100,
          discountReason: 'Paga todo',
          expectedTotal: 300,
        },
      ],
    });
    expect(detail.negocio.gestor_cobro_id).toBe('g1');
    expect(detail.pagos[0]).toMatchObject({
      payment_kind: 'pronto_pago',
      discount_amount: 100,
      discount_reason: 'Paga todo',
      expected_total: 300,
    });
  });

  it('trae el vendedor resuelto: sin señal ya no dice «Sin asignar»', () => {
    const detail = mapNegocioDetailFromLocal({
      negocio: { ...negocios[0], sellerName: 'Ana Vendedora', gestorCobroName: 'Gus Gestor' },
      customers,
      cuotas,
      pagos,
    });
    expect(detail.negocio.seller_name).toBe('Ana Vendedora');
    expect(detail.negocio.gestor_cobro_name).toBe('Gus Gestor');
  });

  it('pinta los productos descargados y su subtotal, y el contacto del cliente', () => {
    const detail = mapNegocioDetailFromLocal({
      negocio: negocios[0],
      customers: [{ ...customers[0], email: 'ana@correo.com', address: 'Vereda El Alto' }, customers[1]],
      cuotas,
      pagos,
      items: [
        {
          id: 'i1',
          negocioId: 'n1',
          productId: 'prod-1',
          productName: 'Mesa Rimax',
          productSku: 'MESA-1',
          warehouseId: 'w1',
          description: null,
          quantity: 2,
          unitPrice: 150,
          subtotal: 300,
        },
        // De otro negocio: no puede colarse en este detalle.
        {
          id: 'i2',
          negocioId: 'n2',
          productId: 'prod-2',
          productName: 'Silla',
          productSku: null,
          warehouseId: null,
          description: null,
          quantity: 1,
          unitPrice: 50,
          subtotal: 50,
        },
      ],
    });
    expect(detail.items).toHaveLength(1);
    expect(detail.items[0].product.name).toBe('Mesa Rimax');
    expect(detail.negocio.products_subtotal).toBe(300);
    expect(detail.customer.email).toBe('ana@correo.com');
    expect(detail.customer.address).toBe('Vereda El Alto');
  });

  it('sin productos descargados el detalle no inventa subtotal', () => {
    const detail = mapNegocioDetailFromLocal({ negocio: negocios[0], customers, cuotas, pagos });
    expect(detail.items).toEqual([]);
    expect(detail.negocio.products_subtotal).toBe(0);
  });
});
