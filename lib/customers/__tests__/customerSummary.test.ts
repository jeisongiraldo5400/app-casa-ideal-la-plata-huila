import {
  parseCustomerSummary,
  summarizeCustomerCarteraLocal,
} from '../customerSummary';

describe('parseCustomerSummary', () => {
  it('tolera un payload vacío sin romperse', () => {
    const parsed = parseCustomerSummary(null);
    expect(parsed.customer).toBeNull();
    expect(parsed.seller).toBeNull();
    expect(parsed.negocios).toEqual([]);
    expect(parsed.cartera.total_balance).toBe(0);
    expect(parsed.scope).toEqual({ visible_negocios: 0, hidden_negocios: 0 });
  });

  it('convierte los numeric que llegan como texto', () => {
    const parsed = parseCustomerSummary({
      customer: { id: 'c1', name: 'Ana' },
      cartera: { total_balance: '4250000.00', overdue_balance: '320000', overdue_installments: 2 },
      scope: { visible_negocios: 3, hidden_negocios: '1' },
    });
    expect(parsed.cartera.total_balance).toBe(4250000);
    expect(parsed.cartera.overdue_balance).toBe(320000);
    expect(parsed.scope.hidden_negocios).toBe(1);
  });

  it('descarta negocios sin identificador y normaliza el rol', () => {
    const parsed = parseCustomerSummary({
      customer: { id: 'c1', name: 'Ana' },
      negocios: [
        { negocio_id: 'n1', negocio_numero: 42, role_in_negocio: 'codeudor', remaining_balance: '1800000' },
        { negocio_numero: 43 },
      ],
    });
    expect(parsed.negocios).toHaveLength(1);
    expect(parsed.negocios[0]).toMatchObject({
      negocio_id: 'n1',
      role_in_negocio: 'codeudor',
      remaining_balance: 1800000,
    });
  });

  it('un cliente sin vendedor deja `seller` en null', () => {
    const parsed = parseCustomerSummary({ customer: { id: 'c1', name: 'Ana' }, seller: null });
    expect(parsed.seller).toBeNull();
  });
});

describe('summarizeCustomerCarteraLocal', () => {
  const today = '2026-09-10';

  it('el saldo nunca es negativo y las cuotas pagadas no cuentan', () => {
    const result = summarizeCustomerCarteraLocal(
      [
        { dueDate: '2026-09-01', amount: 100, paidAmount: 150, lateFeeAmount: 0, status: 'parcial' },
        { dueDate: '2026-08-01', amount: 200, paidAmount: 0, lateFeeAmount: 0, status: 'pagada' },
      ],
      [],
      today
    );
    expect(result.total_balance).toBe(0);
  });

  it('el vencido se decide por fecha, no por el estado guardado', () => {
    // La cuota sigue como "pendiente" porque el job de mora no ha corrido.
    const result = summarizeCustomerCarteraLocal(
      [{ dueDate: '2026-08-01', amount: 200, paidAmount: 50, lateFeeAmount: 10, status: 'pendiente' }],
      [],
      today
    );
    expect(result.overdue_balance).toBe(160);
    expect(result.overdue_installments).toBe(1);
  });

  it('la próxima cuota suma todas las que vencen ese mismo día', () => {
    const result = summarizeCustomerCarteraLocal(
      [
        { dueDate: '2026-09-12', amount: 100, paidAmount: 0, lateFeeAmount: 0, status: 'pendiente' },
        { dueDate: '2026-09-12', amount: 50, paidAmount: 0, lateFeeAmount: 0, status: 'pendiente' },
        { dueDate: '2026-10-12', amount: 999, paidAmount: 0, lateFeeAmount: 0, status: 'pendiente' },
      ],
      [],
      today
    );
    expect(result.next_due_date).toBe('2026-09-12');
    expect(result.next_due_amount).toBe(150);
  });

  it('un recibo anulado no cuenta como último pago', () => {
    const result = summarizeCustomerCarteraLocal(
      [],
      [
        { id: 'p2', negocioId: 'n1', amount: 500, paidAt: '2026-09-05', receiptNumber: 'B', receiptStatus: 'anulado' },
        { id: 'p1', negocioId: 'n1', amount: 150, paidAt: '2026-08-28', receiptNumber: 'A', receiptStatus: 'emitido' },
      ],
      today
    );
    expect(result.last_payment?.id).toBe('p1');
  });

  it('sin pagos vigentes no hay último pago', () => {
    const result = summarizeCustomerCarteraLocal([], [], today);
    expect(result.last_payment).toBeNull();
  });
});
