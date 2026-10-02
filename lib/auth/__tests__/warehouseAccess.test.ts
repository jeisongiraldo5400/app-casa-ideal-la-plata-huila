import { canUseTransfersFor, canUseWarehousesFor, warehouseAccessFor } from '../warehouseAccess';

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

describe('canUseTransfersFor', () => {
  it('admin y bodeguero entran siempre, aunque no tengan bodega ni tareas', () => {
    for (const role of ['admin', 'Bodeguero ']) {
      expect(canUseTransfersFor({ roleNames: [role], membershipsCount: 0, tasksCount: 0 })).toBe(true);
    }
  });

  it('cualquier rol entra si es responsable de una bodega (lo dice el servidor)', () => {
    expect(canUseTransfersFor({ roleNames: ['vendedor'], membershipsCount: 1, tasksCount: 0 })).toBe(true);
    expect(canUseTransfersFor({ roleNames: [], membershipsCount: 1, tasksCount: 0 })).toBe(true);
  });

  it('el transportador sin bodega entra por sus tareas', () => {
    expect(canUseTransfersFor({ roleNames: ['gestor de cobro'], membershipsCount: 0, tasksCount: 2 })).toBe(true);
  });

  it('sin rol de almacén, sin bodega y sin tareas no entra', () => {
    expect(canUseTransfersFor({ roleNames: ['vendedor', 'recaudador'], membershipsCount: 0, tasksCount: 0 })).toBe(false);
  });
});

describe('canUseWarehousesFor', () => {
  it('admin entra siempre, aunque no sea responsable de ninguna bodega', () => {
    expect(canUseWarehousesFor({ roleNames: [' Admin '], membershipsCount: 0 })).toBe(true);
  });

  it('cualquier otro usuario entra solo si es responsable de alguna bodega', () => {
    expect(canUseWarehousesFor({ roleNames: ['vendedor'], membershipsCount: 1 })).toBe(true);
    expect(canUseWarehousesFor({ roleNames: [], membershipsCount: 2 })).toBe(true);
  });

  it('bodeguero sin bodega asignada no ve Bodegas', () => {
    expect(canUseWarehousesFor({ roleNames: ['bodeguero'], membershipsCount: 0 })).toBe(false);
    expect(canUseWarehousesFor({ roleNames: ['vendedor', 'recaudador'], membershipsCount: 0 })).toBe(false);
  });
});
