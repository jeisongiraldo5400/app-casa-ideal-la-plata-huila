import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';
import type { CatalogSection } from '@/lib/catalogos/types';
import { CatalogSectionsSummary } from '../CatalogSectionsSummary';

jest.mock('@/components/theme', () => ({ useTheme: () => ({ isDark: false }) }));

function section(id: string, title: string): CatalogSection {
  return { id, title, kicker: null, body: `Texto de ${title}`, imageUrl: null, sortOrder: 0, items: [] };
}

const EMPTY = new Map();

function renderSections(sections: CatalogSection[]) {
  return render(<CatalogSectionsSummary sections={sections} products={EMPTY} categories={EMPTY} />);
}

describe('CatalogSectionsSummary', () => {
  it('abre la primera categoría y deja las demás cerradas', () => {
    const screen = renderSections([section('s1', 'Cocina'), section('s2', 'Lavado')]);

    expect(screen.queryByText('Texto de Cocina')).not.toBeNull();
    expect(screen.queryByText('Texto de Lavado')).toBeNull();
  });

  it('abre la primera cuando las categorías llegan tarde, y no la reabre si el usuario la cierra', () => {
    const screen = renderSections([]);
    screen.rerender(
      <CatalogSectionsSummary sections={[section('s1', 'Cocina')]} products={EMPTY} categories={EMPTY} />
    );
    expect(screen.queryByText('Texto de Cocina')).not.toBeNull();

    fireEvent.press(screen.getByLabelText('Cerrar categoría Cocina'));
    expect(screen.queryByText('Texto de Cocina')).toBeNull();

    // Un re-render con la misma lista (refresco del detalle) la deja cerrada.
    screen.rerender(
      <CatalogSectionsSummary sections={[section('s1', 'Cocina')]} products={EMPTY} categories={EMPTY} />
    );
    expect(screen.queryByText('Texto de Cocina')).toBeNull();
  });

  it('vuelve a abrir la primera cuando se muestra otro catálogo', () => {
    const screen = renderSections([section('s1', 'Cocina')]);
    fireEvent.press(screen.getByLabelText('Cerrar categoría Cocina'));

    screen.rerender(
      <CatalogSectionsSummary sections={[section('s9', 'Colchones')]} products={EMPTY} categories={EMPTY} />
    );
    expect(screen.queryByText('Texto de Colchones')).not.toBeNull();
  });
});
