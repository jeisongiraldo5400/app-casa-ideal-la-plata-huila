import { applySalePriceToLine, prefillUnitPriceText } from '../salePrice';
import { formatNegocioMoneyInput } from '../../infrastructure/services/negociosStockService';

describe('precio de venta al agregar un producto al negocio', () => {
  it('rellena el campo vacío con el precio de venta formateado', () => {
    expect(prefillUnitPriceText('', 1_890_000, formatNegocioMoneyInput)).toBe('1.890.000');
    expect(prefillUnitPriceText('  ', 50_000, formatNegocioMoneyInput)).toBe('50.000');
  });

  it('no pisa lo escrito ni rellena sin precio', () => {
    expect(prefillUnitPriceText('999.000', 1_890_000, formatNegocioMoneyInput)).toBe('999.000');
    expect(prefillUnitPriceText('', null, formatNegocioMoneyInput)).toBe('');
    expect(prefillUnitPriceText('', 0, formatNegocioMoneyInput)).toBe('');
  });

  const lines = [
    { product_id: 'p1', warehouse_id: 'w1', unit_price: 0, quantity: 1, description: 'Nevera' },
    { product_id: 'p1', warehouse_id: 'w2', unit_price: 0, quantity: 1, description: 'Nevera' },
    { product_id: 'p2', warehouse_id: 'w1', unit_price: 300_000, quantity: 1, description: 'Silla' },
  ];

  it('pone el precio solo en la línea agregada (producto + bodega) sin valor', () => {
    const next = applySalePriceToLine(lines, 'p1', 'w1', 1_890_000);
    expect(next[0].unit_price).toBe(1_890_000);
    expect(next[1].unit_price).toBe(0);
    expect(next[2]).toBe(lines[2]);
  });

  it('no cambia una línea que ya tiene valor (el vendedor ya escribió)', () => {
    expect(applySalePriceToLine(lines, 'p2', 'w1', 1)).toBe(lines);
  });

  it('sin precio, o si la línea ya no está, devuelve lo mismo', () => {
    expect(applySalePriceToLine(lines, 'p1', 'w1', null)).toBe(lines);
    expect(applySalePriceToLine(lines, 'p9', 'w1', 10)).toBe(lines);
  });
});
