import { formatNegocioProductLine, groupNegocioProducts, summarizeNegocioProducts } from '../negocioProducts';

describe('groupNegocioProducts', () => {
  it('agrupa por negocio y suma el mismo producto en dos bodegas', () => {
    const grouped = groupNegocioProducts([
      { negocioId: 'n1', productName: 'Colchón doble', productSku: 'COL-2', description: null, quantity: 1 },
      { negocioId: 'n1', productName: 'Colchón doble', productSku: 'COL-2', description: null, quantity: 2 },
      { negocioId: 'n1', productName: 'Base cama', productSku: null, description: null, quantity: 1 },
      { negocioId: 'n2', productName: null, productSku: null, description: 'Armario a medida', quantity: 1 },
    ]);
    expect(grouped.get('n1')).toEqual([
      { name: 'Colchón doble', sku: 'COL-2', quantity: 3 },
      { name: 'Base cama', sku: null, quantity: 1 },
    ]);
    expect(grouped.get('n2')).toEqual([{ name: 'Armario a medida', sku: null, quantity: 1 }]);
  });

  it('sin nombre ni descripción dice «Producto»', () => {
    const grouped = groupNegocioProducts([
      { negocioId: 'n1', productName: '  ', productSku: null, description: null, quantity: 1 },
    ]);
    expect(grouped.get('n1')?.[0].name).toBe('Producto');
  });
});

describe('formatNegocioProductLine', () => {
  it('muestra cantidad × nombre', () => {
    expect(formatNegocioProductLine({ name: 'Colchón', sku: null, quantity: 2 })).toBe('2 × Colchón');
    expect(formatNegocioProductLine({ name: 'Tela', sku: null, quantity: 1.5 })).toBe('1.50 × Tela');
  });
});

describe('summarizeNegocioProducts', () => {
  const line = (name: string, quantity = 1) => ({ name, sku: null, quantity });

  it('hasta 3 líneas sin «más»', () => {
    expect(summarizeNegocioProducts([line('Colchón', 2), line('Base')])).toEqual({
      lines: ['2 × Colchón', '1 × Base'],
      more: 0,
    });
  });

  it('con más de 3 cuenta los que quedan fuera', () => {
    const summary = summarizeNegocioProducts([line('A'), line('B'), line('C'), line('D'), line('E')]);
    expect(summary.lines).toEqual(['1 × A', '1 × B', '1 × C']);
    expect(summary.more).toBe(2);
  });
});
