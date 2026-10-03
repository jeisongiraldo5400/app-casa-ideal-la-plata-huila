import { pickCustomerWhatsApp, toCustomerWhatsAppNumber } from '../negocioWhatsApp';

describe('toCustomerWhatsAppNumber', () => {
  it.each([
    ['3001234567', '573001234567'],
    ['300 123-4567', '573001234567'],
    ['(300) 123 45 67', '573001234567'],
    ['+57 300 123 4567', '573001234567'],
    ['57 3001234567', '573001234567'],
    ['0057 300 123 4567', '573001234567'],
    ['  310.555.0101  ', '573105550101'],
  ])('celular colombiano %p → %p', (raw, expected) => {
    expect(toCustomerWhatsAppNumber(raw)).toBe(expected);
  });

  it.each([
    [null],
    [undefined],
    [''],
    ['   '],
    ['6011234567'], // fijo de Bogotá con el prefijo nuevo
    ['4441234'], // fijo de 7 dígitos
    ['+57 601 123 4567'],
    ['300123456'], // le falta un dígito
    ['30012345678'], // le sobra uno
    ['sin teléfono'],
  ])('sin WhatsApp: %p', (raw) => {
    expect(toCustomerWhatsAppNumber(raw)).toBeNull();
  });

  it('acepta otro país solo si viene con + o 00', () => {
    expect(toCustomerWhatsAppNumber('+1 (305) 555-0101')).toBe('13055550101');
    expect(toCustomerWhatsAppNumber('0034 612 345 678')).toBe('34612345678');
    expect(toCustomerWhatsAppNumber('13055550101')).toBeNull();
  });
});

describe('pickCustomerWhatsApp', () => {
  it('usa el teléfono 1 si sirve', () => {
    expect(pickCustomerWhatsApp('300 111 2222', '310 555 0101')).toEqual({
      number: '573001112222',
      phone: '300 111 2222',
    });
  });

  it('cae al teléfono 2 si el 1 es fijo o vacío', () => {
    expect(pickCustomerWhatsApp('601 234 5678', '310 555 0101')).toEqual({
      number: '573105550101',
      phone: '310 555 0101',
    });
    expect(pickCustomerWhatsApp(null, ' 3105550101 ')).toEqual({ number: '573105550101', phone: '3105550101' });
  });

  it('null si ninguno sirve', () => {
    expect(pickCustomerWhatsApp(null, null)).toBeNull();
    expect(pickCustomerWhatsApp('4441234', '')).toBeNull();
  });
});
