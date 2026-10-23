import { parseUncostedCount, uncostedOrderMessage } from '../uncostedOrderNotice';

describe('aviso «Mercancía sin costo»', () => {
  it('lee el conteo solo si es un entero positivo', () => {
    expect(parseUncostedCount('3')).toBe(3);
    expect(parseUncostedCount(['2'])).toBe(2);
    expect(parseUncostedCount(5)).toBe(5);
    expect(parseUncostedCount('0')).toBeNull();
    expect(parseUncostedCount('1.5')).toBeNull();
    expect(parseUncostedCount(undefined)).toBeNull();
  });

  it('arma la frase en lenguaje llano', () => {
    expect(uncostedOrderMessage('OC-0597', 3)).toBe('Llegó mercancía de la orden OC-0597 con 3 productos sin costo.');
    expect(uncostedOrderMessage('OC-0597', 1)).toBe('Llegó mercancía de la orden OC-0597 con 1 producto sin costo.');
    expect(uncostedOrderMessage(null, null)).toBe('Llegó mercancía de una orden de compra con productos sin costo.');
  });
});
