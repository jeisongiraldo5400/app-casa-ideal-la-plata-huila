import {
  customerPhoneList,
  customerPhonesError,
  formatCustomerPhones,
  isSamePhone,
  toStoredPhone,
} from '../customerPhones';

describe('customerPhones', () => {
  it('toStoredPhone recorta y deja null si queda vacío', () => {
    expect(toStoredPhone(' 300 1 ')).toBe('300 1');
    expect(toStoredPhone('  ')).toBeNull();
    expect(toStoredPhone(undefined)).toBeNull();
  });

  it('isSamePhone compara por dígitos', () => {
    expect(isSamePhone('300 111-2222', '3001112222')).toBe(true);
    expect(isSamePhone('300', '310')).toBe(false);
    expect(isSamePhone('', '')).toBe(false);
  });

  it('customerPhoneList y formatCustomerPhones omiten vacíos y repetidos', () => {
    expect(customerPhoneList('300', '310')).toEqual(['300', '310']);
    expect(customerPhoneList(null, '310')).toEqual(['310']);
    expect(customerPhoneList('3-0-0', '300')).toEqual(['3-0-0']);
    expect(formatCustomerPhones('300', '310')).toBe('300 / 310');
    expect(formatCustomerPhones(null, '')).toBeNull();
  });

  it('customerPhonesError valida tope de 20 y número repetido', () => {
    expect(customerPhonesError('300', '')).toBeNull();
    expect(customerPhonesError('1'.repeat(21), '')).toMatch(/^El teléfono no puede/);
    expect(customerPhonesError('300', '1'.repeat(21))).toMatch(/teléfono 2/);
    expect(customerPhonesError('300 1', '3001')).toBe('Es el mismo número del teléfono 1');
  });
});
