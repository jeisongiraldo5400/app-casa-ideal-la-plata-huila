import { canAttachPagoSupport, pagoSupportQueueTarget, pagoSupportUiState } from '../pagoSupportRules';

const roles = { isAdmin: false, isVendedor: false, isGestorCobro: false, isRecaudador: false };
const negocio = { seller_id: 'vend-1', created_by: 'crea-1', gestor_cobro_id: 'gest-1' };

describe('canAttachPagoSupport (espejo de attach_negocio_pago_support)', () => {
  const base = { ...roles, negocio, pagoCreatedBy: 'otro' };

  it('admin siempre', () => {
    expect(canAttachPagoSupport({ ...base, userId: 'u', isAdmin: true })).toBe(true);
  });
  it('quien registró el pago', () => {
    expect(canAttachPagoSupport({ ...base, userId: 'autor', pagoCreatedBy: 'autor' })).toBe(true);
  });
  it('vendedor dueño o creador del negocio, pero no otro vendedor', () => {
    expect(canAttachPagoSupport({ ...base, userId: 'vend-1', isVendedor: true })).toBe(true);
    expect(canAttachPagoSupport({ ...base, userId: 'crea-1', isVendedor: true })).toBe(true);
    expect(canAttachPagoSupport({ ...base, userId: 'vend-9', isVendedor: true })).toBe(false);
    // Ser el vendedor del negocio sin el rol no basta (el RPC exige has_role).
    expect(canAttachPagoSupport({ ...base, userId: 'vend-1' })).toBe(false);
  });
  it('gestor de cobro solo si está asignado', () => {
    expect(canAttachPagoSupport({ ...base, userId: 'gest-1', isGestorCobro: true })).toBe(true);
    expect(canAttachPagoSupport({ ...base, userId: 'gest-2', isGestorCobro: true })).toBe(false);
  });
  it('recaudador en cualquier negocio', () => {
    expect(canAttachPagoSupport({ ...base, userId: 'rec', isRecaudador: true })).toBe(true);
  });
  it('pago aún en la cola del teléfono: lo registró este usuario', () => {
    expect(canAttachPagoSupport({ ...base, userId: 'u', pagoIsLocal: true })).toBe(true);
  });
  it('sin usuario nunca', () => {
    expect(canAttachPagoSupport({ ...base, userId: null, isAdmin: true })).toBe(false);
  });
});

describe('pagoSupportUiState', () => {
  const methods = [
    { id: 'pm-ef', requiresSupport: false },
    { id: 'pm-con', requiresSupport: true },
  ];
  const empty = new Set<string>();

  it('con soporte en el servidor', () => {
    expect(pagoSupportUiState({ pago: { id: 'p', support_path: 'n/p.jpg' }, queuedPagoIds: empty, methods })).toBe('attached');
  });
  it('en cola del teléfono', () => {
    expect(
      pagoSupportUiState({ pago: { id: 'p', support_path: null }, queuedPagoIds: new Set(['p']), methods })
    ).toBe('queued');
  });
  it('sin soporte y el método lo exige → obligatorio', () => {
    expect(
      pagoSupportUiState({ pago: { id: 'p', support_path: null, payment_method_id: 'pm-con' }, queuedPagoIds: empty, methods })
    ).toBe('required_missing');
    expect(
      pagoSupportUiState({ pago: { id: 'p', support_path: null, payment_method_id: 'pm-ef' }, queuedPagoIds: empty, methods })
    ).toBe('missing');
  });
  it('fila local de un pago sincronizado (sin el dato) → desconocido', () => {
    expect(pagoSupportUiState({ pago: { id: 'p' }, queuedPagoIds: empty, methods })).toBe('unknown');
  });
  it('pago solo del teléfono sin soporte → se puede adjuntar', () => {
    expect(
      pagoSupportUiState({ pago: { id: 'p', payment_method_id: 'pm-con' }, queuedPagoIds: empty, localPagoIds: new Set(['p']), methods })
    ).toBe('required_missing');
  });
});

describe('pagoSupportQueueTarget', () => {
  it('pago del servidor: id de servidor y carril por defecto', () => {
    expect(pagoSupportQueueTarget({ pagoId: 's1', localPago: { rowSyncStatus: 'synced' }, pagoCommands: [] })).toEqual({
      pagoLocalId: null,
      pagoServerId: 's1',
    });
    expect(pagoSupportQueueTarget({ pagoId: 's1', localPago: null, pagoCommands: [] })).toEqual({
      pagoLocalId: null,
      pagoServerId: 's1',
    });
  });
  it('pago de la cola: id local y el carril de su comando', () => {
    expect(
      pagoSupportQueueTarget({
        pagoId: 'l1',
        localPago: { rowSyncStatus: 'pending' },
        pagoCommands: [
          { payload: { pagoLocalId: 'otro', lane: 'negocio:x' } },
          { payload: { pagoLocalId: 'l1', lane: 'route:r1' } },
        ],
      })
    ).toEqual({ pagoLocalId: 'l1', pagoServerId: null, lane: 'route:r1' });
  });
  it('pago rechazado: no se adjunta', () => {
    expect(() =>
      pagoSupportQueueTarget({ pagoId: 'l1', localPago: { rowSyncStatus: 'rejected' }, pagoCommands: [] })
    ).toThrow(/no aceptó/);
  });
});
