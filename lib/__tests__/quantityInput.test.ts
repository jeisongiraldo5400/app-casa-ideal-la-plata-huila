import {
  parseWholeQuantityText,
  quantityFromText,
  syncQuantityDraft,
  WHOLE_QUANTITY_MESSAGE,
} from '../quantityInput';

describe('quantityInput (móvil)', () => {
  it('usa el mismo mensaje que la web', () => {
    expect(WHOLE_QUANTITY_MESSAGE).toBe('La cantidad debe ser un número entero');
  });

  it.each([
    ['1', 1],
    ['15', 15],
    ['0', 0],
    [' 8 ', 8],
  ])('%p es la cantidad entera %p', (text, value) => {
    expect(parseWholeQuantityText(text)).toEqual({ status: 'whole', value });
  });

  it.each(['', '  ', null, undefined])('%p está vacío', (text) => {
    expect(parseWholeQuantityText(text)).toEqual({ status: 'empty' });
  });

  it.each(['1.5', '1,5', '1.000', '1.', '-3', '2e1', 'abc'])(
    '%p es inválido y nunca se convierte en otro número',
    (text) => {
      expect(parseWholeQuantityText(text)).toEqual({
        status: 'invalid',
        error: WHOLE_QUANTITY_MESSAGE,
      });
    }
  );

  it('quantityFromText: solo un entero produce cantidad; lo demás es 0', () => {
    expect(quantityFromText(parseWholeQuantityText('7'))).toBe(7);
    expect(quantityFromText(parseWholeQuantityText('1.5'))).toBe(0);
    expect(quantityFromText(parseWholeQuantityText('1.000'))).toBe(0);
    expect(quantityFromText(parseWholeQuantityText(''))).toBe(0);
  });

  it('syncQuantityDraft conserva un texto inválido y sigue la cantidad en lo demás', () => {
    expect(syncQuantityDraft('1.5', 0)).toBe('1.5');
    expect(syncQuantityDraft('3', 3)).toBe('3');
    expect(syncQuantityDraft('3', 5)).toBe('5');
    expect(syncQuantityDraft('', 0)).toBe('');
    expect(syncQuantityDraft('', 2)).toBe('2');
  });
});
