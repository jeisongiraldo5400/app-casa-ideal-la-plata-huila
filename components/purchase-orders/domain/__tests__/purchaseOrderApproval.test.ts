import {
  canApprovePurchaseOrders,
  purchaseOrderApprovalAdminOnlyMessage,
} from '../purchaseOrderApproval';

describe('purchaseOrderApproval', () => {
  it('solo el rol admin aprueba', () => {
    expect(canApprovePurchaseOrders(['admin'])).toBe(true);
    expect(canApprovePurchaseOrders([{ nombre: 'bodeguero' }, { nombre: ' Admin ' }])).toBe(true);
    expect(canApprovePurchaseOrders(['bodeguero'])).toBe(false);
    expect(canApprovePurchaseOrders([{ nombre: 'vendedor' }, null, { nombre: null }])).toBe(false);
    expect(canApprovePurchaseOrders([])).toBe(false);
    expect(canApprovePurchaseOrders(undefined)).toBe(false);
  });

  it('usa el mismo mensaje que el servidor', () => {
    expect(purchaseOrderApprovalAdminOnlyMessage('OC-2026-0009')).toBe(
      'Solo un administrador puede aprobar la orden de compra OC-2026-0009.'
    );
    expect(purchaseOrderApprovalAdminOnlyMessage(null)).toBe(
      'Solo un administrador puede aprobar la orden de compra sin número.'
    );
  });
});
