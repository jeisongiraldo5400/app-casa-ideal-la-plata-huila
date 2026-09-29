// Traduce «qué hay montado en la edición» a motivos legibles. Copia de
// `catalogo-casa-ideal/src/features/private-catalogs/readiness.ts`.

export type CatalogSectionSummary = {
  title: string;
  productCount: number;
  /**
   * Productos que la sección tenía pero ya salen en una anterior: solo se
   * muestran una vez. Distingue «vacía» de «solo repite otras».
   */
  repeatedCount?: number;
};

export type CatalogReadiness = {
  /** Impiden publicar. */
  blockers: string[];
  /** No impiden publicar, pero conviene revisarlos. */
  warnings: string[];
  canPublish: boolean;
  productCount: number;
};

export function evaluateCatalogReadiness(sections: readonly CatalogSectionSummary[]): CatalogReadiness {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const productCount = sections.reduce((total, section) => total + section.productCount, 0);

  if (sections.length === 0) {
    blockers.push('La edición no tiene categorías todavía.');
  } else if (productCount === 0) {
    blockers.push(
      'Ninguna categoría contiene fichas de producto publicadas. Publica las fichas en «Productos».'
    );
  } else {
    const empty = sections
      .filter((section) => section.productCount === 0 && !(section.repeatedCount ?? 0))
      .map((section) => section.title);
    const onlyRepeated = sections
      .filter((section) => section.productCount === 0 && (section.repeatedCount ?? 0) > 0)
      .map((section) => section.title);
    if (empty.length === 1) {
      warnings.push(`La categoría «${empty[0]}» no tiene fichas publicadas y saldrá vacía.`);
    } else if (empty.length > 1) {
      warnings.push(`${empty.length} categorías no tienen fichas publicadas y saldrán vacías: ${empty.join(', ')}.`);
    }
    if (onlyRepeated.length === 1) {
      warnings.push(`La categoría «${onlyRepeated[0]}» solo repite productos de otras categorías y no aparecerá.`);
    } else if (onlyRepeated.length > 1) {
      warnings.push(`${onlyRepeated.length} categorías solo repiten productos de otras y no aparecerán: ${onlyRepeated.join(', ')}.`);
    }
  }

  return { blockers, warnings, canPublish: blockers.length === 0, productCount };
}
