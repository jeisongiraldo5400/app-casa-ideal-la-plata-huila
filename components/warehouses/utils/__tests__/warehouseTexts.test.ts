import { incomingText, managersText, pendingDispatchText, stockSummaryText } from '../warehouseTexts';
import { parseWarehouseTabParam, warehouseDetailHref } from '../warehouseRoutes';

describe('warehouseTexts', () => {
  it('resumen de existencias con singular y plural', () => {
    expect(stockSummaryText({ totalProducts: 12, totalUnits: 340 })).toBe('12 productos · 340 unidades');
    expect(stockSummaryText({ totalProducts: 1, totalUnits: 1 })).toBe('1 producto · 1 unidad');
    expect(stockSummaryText({ totalProducts: 0, totalUnits: 0 })).toBe('0 productos · 0 unidades');
  });

  it('en camino y por sacar solo cuando hay', () => {
    expect(incomingText({ incomingTransfers: 2 })).toBe('2 en camino');
    expect(incomingText({ incomingTransfers: 0 })).toBeNull();
    expect(pendingDispatchText({ pendingDispatch: 1 })).toBe('1 por sacar');
    expect(pendingDispatchText({ pendingDispatch: 0 })).toBeNull();
  });

  it('encargados', () => {
    expect(managersText([])).toBe('Sin encargado asignado');
    expect(managersText(['Ana'])).toBe('Encargado: Ana');
    expect(managersText(['Ana', 'Luis'])).toBe('Encargados: Ana, Luis');
  });

  it('rutas', () => {
    expect(warehouseDetailHref({ id: 'w 1', name: 'La Argentina' })).toBe('/bodega/w%201?nombre=La%20Argentina');
    expect(parseWarehouseTabParam('historial')).toBe('historial');
    expect(parseWarehouseTabParam(['camino'])).toBe('camino');
    expect(parseWarehouseTabParam('otra')).toBe('productos');
    expect(parseWarehouseTabParam(undefined)).toBe('productos');
  });
});
