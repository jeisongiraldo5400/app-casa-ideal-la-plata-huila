import { mapNegocioDetailFromLocal, mapNegociosListFromLocal } from '../negociosLocal';

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
    expect(list[1].installments_count).toBeNull();
    expect(list[1].delivery_order_id).toBeNull();
    expect(list[1].seller_id).toBe('s1');
    expect(list[0].seller_id).toBeNull();
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
});
