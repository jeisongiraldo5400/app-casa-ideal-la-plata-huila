import { warehouseAccessFor } from '../warehouseAccess';

describe('warehouseAccessFor', () => {
  it('admin y bodeguero: entradas, compras y cualquier salida', () => {
    for (const role of ['admin', 'Bodeguero']) {
      expect(warehouseAccessFor([role])).toEqual({
        canRegisterEntries: true,
        canReadPurchaseOrders: true,
        canRegisterAnyExit: true,
        canUseExits: true,
        canSeeAllOrders: true,
      });
    }
  });

  it('vendedor y gestor: solo sus salidas asignadas, sin entradas ni compras', () => {
    for (const role of ['vendedor', 'gestor de cobro']) {
      const access = warehouseAccessFor([role]);
      expect(access.canUseExits).toBe(true);
      expect(access.canRegisterAnyExit).toBe(false);
      expect(access.canRegisterEntries).toBe(false);
      expect(access.canReadPurchaseOrders).toBe(false);
    }
  });

  it('recaudador puro: solo consulta órdenes de entrega', () => {
    expect(warehouseAccessFor(['recaudador'])).toEqual({
      canRegisterEntries: false,
      canReadPurchaseOrders: false,
      canRegisterAnyExit: false,
      canUseExits: false,
      canSeeAllOrders: true,
    });
  });

  it('sin roles no muestra nada de almacén', () => {
    expect(warehouseAccessFor([]).canSeeAllOrders).toBe(false);
  });
});
