import {
  aggregateNegocioStockItems,
  formatNegocioMoneyInput,
  parseNegocioMoney,
  parseNegocioQuantity,
  validateNegocioItemsInput,
} from '../negociosStockService';

describe('negociosStockService money helpers', () => {
  describe('parseNegocioMoney', () => {
    it.each([
      ['1.990.000', 1_990_000],
      ['1990000', 1_990_000],
      ['1.90', 190],
      ['$ 2.227.000', 2_227_000],
      ['0', 0],
      [1_990_000, 1_990_000],
    ])('interpreta %p como %p pesos', (input, expected) => {
      expect(parseNegocioMoney(input)).toBe(expected);
    });

    it.each(['', '.', 'COP', Number.NaN, Number.POSITIVE_INFINITY])(
      'rechaza el valor monetario inválido %p',
      (input) => {
        expect(parseNegocioMoney(input)).toBeNaN();
      }
    );
  });

  describe('formatNegocioMoneyInput', () => {
    it.each([
      ['1990000', '1.990.000'],
      ['1.990.000', '1.990.000'],
      ['001900', '1.900'],
      ['1.90', '190'],
      ['', ''],
    ])('formatea %p como %p', (input, expected) => {
      expect(formatNegocioMoneyInput(input)).toBe(expected);
    });
  });

  it('mantiene independiente el parser de cantidades', () => {
    expect(parseNegocioQuantity('1.5')).toBe(1.5);
  });

  it('acumula el stock solicitado por producto y bodega', () => {
    expect(aggregateNegocioStockItems([
      { product_id: 'p1', warehouse_id: 'w1', quantity: 3 },
      { product_id: 'p1', warehouse_id: 'w1', quantity: 4 },
      { product_id: 'p1', warehouse_id: 'w2', quantity: 2 },
    ])).toEqual([
      { product_id: 'p1', warehouse_id: 'w1', quantity: 7 },
      { product_id: 'p1', warehouse_id: 'w2', quantity: 2 },
    ]);
  });

  it('rechaza cantidades no enteras', () => {
    expect(() => validateNegocioItemsInput([
      { product_id: 'p1', warehouse_id: 'w1', quantity: 1.5 },
    ])).toThrow('cantidad entera');
  });
});
