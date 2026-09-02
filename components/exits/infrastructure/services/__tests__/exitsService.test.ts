import { sanitizeSearchTerm } from '../exitsService';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

describe('sanitizeSearchTerm', () => {
  it('conserva letras, números, espacios, puntos, guiones y apóstrofes', () => {
    expect(sanitizeSearchTerm("  María José O'Neil-Pérez S.A.S 1023  ")).toBe("María José O'Neil-Pérez S.A.S 1023");
  });

  it('elimina los caracteres reservados del filtro PostgREST y los comodines de LIKE', () => {
    expect(sanitizeSearchTerm('Casa, Ideal (Bogotá) 50% "x" a_b\\c')).toBe('Casa Ideal Bogotá 50 x a b c');
  });

  it('devuelve cadena vacía cuando solo hay caracteres inválidos', () => {
    expect(sanitizeSearchTerm(',()%_')).toBe('');
  });
});
