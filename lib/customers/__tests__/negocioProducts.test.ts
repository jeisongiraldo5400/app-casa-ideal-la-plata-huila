import { formatNegocioProductLine, groupNegocioProducts } from '../negocioProducts';

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
