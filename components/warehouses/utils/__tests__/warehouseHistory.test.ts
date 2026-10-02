import {
  HISTORY_TYPE_FILTERS,
  WAREHOUSE_MOVEMENT_LABEL,
  WAREHOUSE_MOVEMENT_TYPES,
  documentText,
  formatSignedQuantity,
  formatUnits,
  historyDateRange,
  isMovementType,
  movementTypesFor,
  movesPhysicalStock,
} from '../warehouseHistory';

describe('warehouseHistory', () => {
  it('cada tipo de movimiento tiene su etiqueta en español (igual que la web)', () => {
    for (const type of WAREHOUSE_MOVEMENT_TYPES) expect(WAREHOUSE_MOVEMENT_LABEL[type]).toBeTruthy();
    expect(WAREHOUSE_MOVEMENT_LABEL.exit).toBe('Salida');
    expect(WAREHOUSE_MOVEMENT_LABEL.transfer_receipt).toBe('Traslado recibido');
    expect(WAREHOUSE_MOVEMENT_LABEL.reservation).toBe('Separado para orden');
    expect(WAREHOUSE_MOVEMENT_LABEL.warehouse_change).toBe('Cambio de la bodega');
  });

  it('reconoce solo los tipos que acepta la RPC', () => {
    expect(isMovementType('transfer_write_off')).toBe(true);
    expect(isMovementType('otro')).toBe(false);
    expect(isMovementType(3)).toBe(false);
  });

  it('separados, bajas y cambios de la bodega no mueven existencias físicas', () => {
    expect(movesPhysicalStock('exit')).toBe(true);
    expect(movesPhysicalStock('transfer_receipt')).toBe(true);
    expect(movesPhysicalStock('reservation')).toBe(false);
    expect(movesPhysicalStock('transfer_write_off')).toBe(false);
  });

  it('filtro por tipo: «Todos» no envía tipos; cada grupo solo tipos válidos', () => {
    expect(movementTypesFor('all')).toBeNull();
    expect(movementTypesFor('salidas')).toEqual(['exit']);
    for (const filter of HISTORY_TYPE_FILTERS) {
      for (const type of filter.types ?? []) expect(isMovementType(type)).toBe(true);
    }
  });

  it('rango de fechas en días de Bogotá', () => {
    // 2026-10-01 03:00 UTC = 30 de septiembre, 10 p. m. en Bogotá
    const now = new Date('2026-10-01T03:00:00Z');
    expect(historyDateRange('all', now)).toEqual({ dateFrom: null, dateTo: null });
    expect(historyDateRange('today', now)).toEqual({ dateFrom: '2026-09-30', dateTo: '2026-09-30' });
    expect(historyDateRange('7d', now)).toEqual({ dateFrom: '2026-09-24', dateTo: '2026-09-30' });
    expect(historyDateRange('30d', now)).toEqual({ dateFrom: '2026-09-01', dateTo: '2026-09-30' });
    expect(historyDateRange('month', now)).toEqual({ dateFrom: '2026-09-01', dateTo: '2026-09-30' });
    expect(historyDateRange('7d', new Date('2026-03-02T15:00:00Z'))).toEqual({ dateFrom: '2026-02-24', dateTo: '2026-03-02' });
  });

  it('formatos de cantidad', () => {
    expect(formatUnits(3)).toBe('3');
    expect(formatUnits(2.5)).toBe('2,5');
    expect(formatUnits(null)).toBe('—');
    expect(formatSignedQuantity(3)).toBe('+3');
    expect(formatSignedQuantity(-2)).toBe('−2');
    expect(formatSignedQuantity(0)).toBe('0');
    expect(formatSignedQuantity(null)).toBe('—');
  });

  it('texto del documento', () => {
    expect(documentText({ documentType: 'delivery_order', documentNumber: 'OE-1' })).toBe('Orden de entrega OE-1');
    expect(documentText({ documentType: 'transfer_order', documentNumber: null })).toBe('Traslado');
    expect(documentText({ documentType: null, documentNumber: null })).toBeNull();
  });
});
