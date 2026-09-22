import { hasNegocioDraft, negocioDraftSummary, type NegocioDraftState } from '../negocioDraft';

const blank: NegocioDraftState = { step: 0, customerId: null, itemsCount: 0, selectedOrderId: null, direccion: '' };

describe('hasNegocioDraft', () => {
  it('un formulario vacío no es un negocio a medias', () => {
    expect(hasNegocioDraft(blank)).toBe(false);
    expect(hasNegocioDraft({ ...blank, direccion: '   ' })).toBe(false);
  });

  it.each([
    ['un cliente elegido', { customerId: 'c1' }],
    ['productos agregados', { itemsCount: 2 }],
    ['una orden de origen elegida', { selectedOrderId: 'oe-1' }],
    ['una dirección escrita', { direccion: 'Calle 5' }],
    ['haber pasado del primer paso', { step: 1 }],
  ])('cuenta como a medias con %s', (_label, patch) => {
    expect(hasNegocioDraft({ ...blank, ...patch })).toBe(true);
  });
});

describe('negocioDraftSummary', () => {
  it('dice para quién, en qué paso y cuántos productos', () => {
    expect(negocioDraftSummary({ customerName: 'MARGOTH ORTEGA SERRATO', stepLabel: 'Productos', itemsCount: 3 })).toBe(
      'para MARGOTH ORTEGA SERRATO · paso «Productos» · 3 productos'
    );
  });

  it('en singular con un producto', () => {
    expect(negocioDraftSummary({ customerName: 'Ana', stepLabel: 'Crédito', itemsCount: 1 })).toBe(
      'para Ana · paso «Crédito» · 1 producto'
    );
  });

  it('sin cliente ni productos', () => {
    expect(negocioDraftSummary({ customerName: null, stepLabel: 'Cliente', itemsCount: 0 })).toBe(
      'sin cliente elegido · paso «Cliente»'
    );
  });
});
