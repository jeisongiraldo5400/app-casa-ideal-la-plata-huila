import { evaluateCatalogReadiness } from '../readiness';

describe('evaluateCatalogReadiness', () => {
  it('bloquea una edición sin categorías', () => {
    const result = evaluateCatalogReadiness([]);
    expect(result.canPublish).toBe(false);
    expect(result.blockers).toEqual(['La edición no tiene categorías todavía.']);
    expect(result.productCount).toBe(0);
  });

  it('bloquea cuando ninguna categoría tiene fichas publicadas', () => {
    const result = evaluateCatalogReadiness([
      { title: 'Sala', productCount: 0 },
      { title: 'Cocina', productCount: 0 },
    ]);
    expect(result.canPublish).toBe(false);
    expect(result.blockers).toHaveLength(1);
    // El bloqueo ya lo explica: no se repite como aviso.
    expect(result.warnings).toEqual([]);
  });

  it('avisa de la única categoría vacía sin bloquear', () => {
    const result = evaluateCatalogReadiness([
      { title: 'Sala', productCount: 3 },
      { title: 'Cocina', productCount: 0 },
    ]);
    expect(result.canPublish).toBe(true);
    expect(result.warnings).toEqual(['La categoría «Cocina» no tiene fichas publicadas y saldrá vacía.']);
  });

  it('resume varias categorías vacías en un solo aviso', () => {
    const result = evaluateCatalogReadiness([
      { title: 'Sala', productCount: 3 },
      { title: 'Cocina', productCount: 0 },
      { title: 'Alcoba', productCount: 0 },
    ]);
    expect(result.warnings).toEqual(['2 categorías no tienen fichas publicadas y saldrán vacías: Cocina, Alcoba.']);
  });

  it('no reporta nada cuando todas las categorías tienen fichas', () => {
    expect(evaluateCatalogReadiness([{ title: 'Sala', productCount: 2 }, { title: 'Cocina', productCount: 1 }])).toEqual({
      blockers: [],
      warnings: [],
      canPublish: true,
      productCount: 3,
    });
  });
});
