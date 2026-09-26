import {
  DuplicateCustomerDocumentError,
  isDuplicateCustomerDocumentMessage,
  normalizeCustomerDocument,
  sameCustomerDocument,
} from '../customerDocument';

describe('normalizeCustomerDocument (espejo de public.norm_document)', () => {
  it('quita puntos, espacios y guiones', () => {
    expect(normalizeCustomerDocument(' 1.234.567 ')).toBe('1234567');
    expect(normalizeCustomerDocument('1 234-567')).toBe('1234567');
    expect(normalizeCustomerDocument('..')).toBe('');
    expect(normalizeCustomerDocument(null)).toBe('');
  });

  it('conserva las letras en mayúscula: un pasaporte no choca con otro que comparta dígitos', () => {
    expect(normalizeCustomerDocument('ab-123')).toBe('AB123');
    expect(sameCustomerDocument('AB123', 'CD123')).toBe(false);
    expect(sameCustomerDocument('1.234.567', '1234567')).toBe(true);
    expect(sameCustomerDocument('', '')).toBe(false);
  });
});

describe('mensajes de documento duplicado', () => {
  it('el error del teléfono usa el mismo texto que el servidor', () => {
    const error = new DuplicateCustomerDocumentError({ id: 'c1', name: 'Ana', id_number: '1234567', deleted: false });
    expect(error.message).toBe('Ya existe un cliente con el documento 1234567 (Ana).');
    expect(isDuplicateCustomerDocumentMessage(error.message)).toBe(true);
  });

  it('reconoce el rechazo por cliente eliminado y nada más', () => {
    expect(
      isDuplicateCustomerDocumentMessage(
        'El documento 7654321 pertenece a Pedro, que fue eliminado. Pide a un administrador que lo restaure.'
      )
    ).toBe(true);
    expect(isDuplicateCustomerDocumentMessage('Sin permiso para crear clientes')).toBe(false);
  });
});
