import {
  matchesNegocioListFilter,
  matchesNegocioListQuery,
  NEGOCIO_LIST_FILTERS,
} from '../negocioListFilters';

describe('negocioListFilters', () => {
  it('expone las cuatro opciones de filtro en el orden esperado', () => {
    expect(NEGOCIO_LIST_FILTERS.map((f) => f.value)).toEqual(['all', 'active', 'overdue', 'draft']);
  });

  describe('matchesNegocioListFilter', () => {
    it('all acepta cualquier estado', () => {
      expect(matchesNegocioListFilter({ status: 'borrador' }, 'all')).toBe(true);
    });

    it('active solo acepta activo/entregado', () => {
      expect(matchesNegocioListFilter({ status: 'activo' }, 'active')).toBe(true);
      expect(matchesNegocioListFilter({ status: 'entregado' }, 'active')).toBe(true);
      expect(matchesNegocioListFilter({ status: 'borrador' }, 'active')).toBe(false);
    });

    it('overdue depende de has_mora', () => {
      expect(matchesNegocioListFilter({ has_mora: true }, 'overdue')).toBe(true);
      expect(matchesNegocioListFilter({ has_mora: false }, 'overdue')).toBe(false);
      expect(matchesNegocioListFilter({}, 'overdue')).toBe(false);
    });

    it('draft solo acepta borrador/por_firmar', () => {
      expect(matchesNegocioListFilter({ status: 'borrador' }, 'draft')).toBe(true);
      expect(matchesNegocioListFilter({ status: 'por_firmar' }, 'draft')).toBe(true);
      expect(matchesNegocioListFilter({ status: 'activo' }, 'draft')).toBe(false);
    });
  });

  describe('matchesNegocioListQuery', () => {
    it('sin query siempre coincide', () => {
      expect(matchesNegocioListQuery({ numero: 12, customer: { name: 'Ana' } }, '')).toBe(true);
    });

    it('coincide por número de negocio', () => {
      expect(matchesNegocioListQuery({ numero: 2026001, customer: { name: 'Ana' } }, '2026001')).toBe(true);
    });

    it('coincide por nombre de cliente sin distinguir mayúsculas', () => {
      expect(matchesNegocioListQuery({ numero: 1, customer: { name: 'Ana Pérez' } }, 'ana pérez')).toBe(true);
    });

    it('no coincide cuando ni el número ni el cliente contienen la query', () => {
      expect(matchesNegocioListQuery({ numero: 1, customer: { name: 'Ana' } }, 'luis')).toBe(false);
    });

    // Reportado por el usuario (2026-09-22): buscar con o sin tildes no traía nada.
    it('encuentra al cliente aunque la tilde no coincida, en los dos sentidos', () => {
      const negocio = { numero: 20260003, customer: { name: 'Álvaro Muñoz' } };
      expect(matchesNegocioListQuery(negocio, 'alvaro munoz')).toBe(true);
      expect(matchesNegocioListQuery(negocio, 'ALVARO')).toBe(true);
      expect(matchesNegocioListQuery({ numero: 1, customer: { name: 'Alvaro Munoz' } }, 'álvaro muñoz')).toBe(true);
    });

    it('encuentra el número aunque se escriba con separadores', () => {
      const negocio = { numero: 20260003, customer: { name: 'Ana' } };
      expect(matchesNegocioListQuery(negocio, '2026-0003')).toBe(true);
      expect(matchesNegocioListQuery(negocio, '0003')).toBe(true);
    });
  });
});
