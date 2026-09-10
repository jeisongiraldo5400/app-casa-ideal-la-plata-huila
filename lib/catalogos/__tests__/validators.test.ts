import { hasErrors, normalizeOptionalText, validateCoverText, validateCreateCatalog, validateShareLinkInput, validateTitle } from '../validators';

describe('validateTitle', () => {
  it('exige entre 2 y 120 caracteres', () => {
    expect(validateTitle('a')).toBe('Escribe al menos 2 caracteres.');
    expect(validateTitle('  ab  ')).toBeNull();
    expect(validateTitle('a'.repeat(121))).toBe('Máximo 120 caracteres.');
  });
});

describe('normalizeOptionalText', () => {
  it('convierte el vacío en null', () => {
    expect(normalizeOptionalText('   ', 100)).toEqual({ value: null, error: null });
  });

  it('reporta el exceso de longitud', () => {
    expect(normalizeOptionalText('a'.repeat(11), 10).error).toBe('Máximo 10 caracteres.');
  });
});

describe('validateCreateCatalog', () => {
  it('el título público es opcional', () => {
    expect(validateCreateCatalog({ internalTitle: 'Lavadoras', publicTitle: '' })).toEqual({});
  });

  it('valida el título público si se escribió', () => {
    expect(validateCreateCatalog({ internalTitle: 'Lavadoras', publicTitle: 'x' }).publicTitle).toBeDefined();
  });

  it('exige el nombre interno', () => {
    expect(validateCreateCatalog({ internalTitle: ' ', publicTitle: '' }).internalTitle).toBeDefined();
  });
});

describe('validateCoverText', () => {
  it('exige ambos títulos y acota la introducción', () => {
    expect(validateCoverText({ internalTitle: 'Casa', publicTitle: 'Casa Ideal', introduction: '' })).toEqual({});
    expect(validateCoverText({ internalTitle: 'Casa', publicTitle: '', introduction: '' }).publicTitle).toBeDefined();
    expect(validateCoverText({ internalTitle: 'Casa', publicTitle: 'Casa', introduction: 'a'.repeat(1201) }).introduction).toBe(
      'La introducción es muy larga.'
    );
  });
});

describe('validateShareLinkInput', () => {
  it('acepta una etiqueta y una vigencia dentro del rango del RPC', () => {
    expect(validateShareLinkInput({ label: 'Familia Pérez', hours: 24 })).toEqual({});
  });

  it('permite dejar vacío el nombre del destinatario', () => {
    expect(validateShareLinkInput({ label: ' ', hours: 24 })).toEqual({});
  });

  it('acota la vigencia entre 1 hora y 30 días', () => {
    expect(validateShareLinkInput({ label: 'Cliente', hours: 0 }).hours).toBe('La vigencia mínima es de 1 hora.');
    expect(validateShareLinkInput({ label: 'Cliente', hours: 721 }).hours).toBe('La vigencia máxima es de 30 días.');
    expect(validateShareLinkInput({ label: 'Cliente', hours: 1.5 }).hours).toBe('La vigencia debe ser un número de horas.');
  });
});

describe('hasErrors', () => {
  it('detecta cualquier mensaje presente', () => {
    expect(hasErrors({})).toBe(false);
    expect(hasErrors({ label: undefined })).toBe(false);
    expect(hasErrors({ label: 'falla' })).toBe(true);
  });
});
