import { evaluateCatalogReadiness } from '../readiness';

describe('evaluateCatalogReadiness', () => {
  it('bloquea una edición sin capítulos', () => {
    const result = evaluateCatalogReadiness([]);
    expect(result.canPublish).toBe(false);
    expect(result.blockers).toEqual(['La edición no tiene capítulos todavía.']);
    expect(result.productCount).toBe(0);
  });

  it('bloquea cuando ningún capítulo tiene fichas publicadas', () => {
    const result = evaluateCatalogReadiness([
      { title: 'Sala', productCount: 0 },
      { title: 'Cocina', productCount: 0 },
    ]);
    expect(result.canPublish).toBe(false);
    expect(result.blockers).toHaveLength(1);
    // El bloqueo ya lo explica: no se repite como aviso.
    expect(result.warnings).toEqual([]);
  });

  it('avisa del único capítulo vacío sin bloquear', () => {
    const result = evaluateCatalogReadiness([
      { title: 'Sala', productCount: 3 },
      { title: 'Cocina', productCount: 0 },
    ]);
    expect(result.canPublish).toBe(true);
    expect(result.warnings).toEqual(['El capítulo «Cocina» no tiene fichas publicadas y saldrá vacío.']);
  });

  it('resume varios capítulos vacíos en un solo aviso', () => {
    const result = evaluateCatalogReadiness([
      { title: 'Sala', productCount: 3 },
      { title: 'Cocina', productCount: 0 },
      { title: 'Alcoba', productCount: 0 },
    ]);
    expect(result.warnings).toEqual(['2 capítulos no tienen fichas publicadas y saldrán vacíos: Cocina, Alcoba.']);
  });

  it('no reporta nada cuando todos los capítulos tienen fichas', () => {
    expect(evaluateCatalogReadiness([{ title: 'Sala', productCount: 2 }, { title: 'Cocina', productCount: 1 }])).toEqual({
      blockers: [],
      warnings: [],
      canPublish: true,
      productCount: 3,
    });
  });
});
