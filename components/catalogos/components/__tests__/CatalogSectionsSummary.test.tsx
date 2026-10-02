import { act, fireEvent, render } from '@testing-library/react-native';
import React from 'react';
import type { PublicCatalogListingItem } from '@/lib/catalogos/publicCatalogTypes';
import type { CategoryPreview } from '@/lib/catalogos/sectionCounts';
import type { CatalogItem, CatalogSection } from '@/lib/catalogos/types';
import { CatalogSectionsSummary } from '../CatalogSectionsSummary';

jest.mock('@/components/theme', () => ({ useTheme: () => ({ isDark: false }) }));
jest.mock('../CatalogImageViewer', () => ({ CatalogImageViewer: () => null }));

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

function listing(n: number, categoryId = 'cat-sala'): PublicCatalogListingItem {
  return {
    catalogProductId: `cp-${n}`,
    productId: `p-${n}`,
    slug: `ficha-${n}`,
    displayName: `Producto ${n}`,
    shortDescription: null,
    stockQuantity: 1,
    categoryId,
    categoryName: 'Sala',
    brandName: null,
    isFeatured: false,
    coverImageUrl: `https://cdn.example/${n}.jpg`,
    publishedAt: null,
  };
}

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, index) => listing(from + index));
const wholeCategory = (referenceId: string): CatalogItem => ({ id: `i-${referenceId}`, itemType: 'category', referenceId, isFeatured: false, sortOrder: 0 });
const looseProduct = (referenceId: string): CatalogItem => ({ id: `i-${referenceId}`, itemType: 'product', referenceId, isFeatured: false, sortOrder: 0 });

function withItems(id: string, title: string, items: CatalogItem[]): CatalogSection {
  return { ...section(id, title), items };
}

describe('CatalogSectionsSummary: todos los productos', () => {
  it('una categoría «siempre al día» con más productos que la muestra deja verlos todos con «Ver más»', async () => {
    const sections = [withItems('s1', 'Sala', [wholeCategory('cat-sala')])];
    // El detalle carga solo la muestra (10 de 25); «Ver más» pide la categoría entera.
    let categories = new Map<string, CategoryPreview>([['cat-sala', { items: range(1, 10), totalCount: 25 }]]);
    const onLoadCategories = jest.fn(async (ids: readonly string[]) => {
      expect(ids).toEqual(['cat-sala']);
      categories = new Map([['cat-sala', { items: range(1, 25), totalCount: 25 }]]);
    });
    const view = () => <CatalogSectionsSummary sections={sections} products={EMPTY} categories={categories} onLoadCategories={onLoadCategories} />;
    const screen = render(view());

    expect(screen.getByText('25 productos')).toBeTruthy();
    expect(screen.getAllByLabelText(/^Ver foto de Producto/)).toHaveLength(10);

    await act(async () => {
      fireEvent.press(screen.getByLabelText('Ver más productos de Sala'));
    });
    screen.rerender(view());
    expect(onLoadCategories).toHaveBeenCalledTimes(1);
    expect(screen.getAllByLabelText(/^Ver foto de Producto/)).toHaveLength(20);
    expect(screen.getByText('Ver más (5)')).toBeTruthy();

    // Ya está entera: la siguiente página no vuelve a pedir nada.
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Ver más productos de Sala'));
    });
    expect(onLoadCategories).toHaveBeenCalledTimes(1);
    expect(screen.getAllByLabelText(/^Ver foto de Producto/)).toHaveLength(25);
    expect(screen.queryByText(/Ver más/)).toBeNull();
    expect(screen.getByText('Producto 25')).toBeTruthy();
  });

  it('sueltos y categoría juntos, sin repetir un producto que ya salió en otra categoría', () => {
    const sections = [
      withItems('s1', 'Destacados', [looseProduct('p-2')]),
      withItems('s2', 'Sala', [wholeCategory('cat-sala')]),
    ];
    const categories = new Map<string, CategoryPreview>([['cat-sala', { items: range(1, 3), totalCount: 3 }]]);
    const screen = render(
      <CatalogSectionsSummary sections={sections} products={new Map([['p-2', listing(2)]])} categories={categories} />
    );
    expect(screen.getByText('1 producto')).toBeTruthy();
    expect(screen.getByText('2 productos')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Abrir categoría Sala'));
    expect(screen.getByText('Producto 1')).toBeTruthy();
    expect(screen.getByText('Producto 3')).toBeTruthy();
    expect(screen.queryByText('Producto 2')).toBeNull();
  });

  it('si falla la carga avisa y no avanza', async () => {
    const sections = [withItems('s1', 'Sala', [wholeCategory('cat-sala')])];
    const categories = new Map<string, CategoryPreview>([['cat-sala', { items: range(1, 10), totalCount: 12 }]]);
    const screen = render(
      <CatalogSectionsSummary sections={sections} products={EMPTY} categories={categories} onLoadCategories={jest.fn(async () => { throw new Error('offline'); })} />
    );
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Ver más productos de Sala'));
    });
    expect(screen.getByText(/No se pudieron cargar más productos/)).toBeTruthy();
    expect(screen.getAllByLabelText(/^Ver foto de Producto/)).toHaveLength(10);
  });
});

describe('CatalogSectionsSummary: agotados', () => {
  it('marca «Agotado» solo en los productos sin existencias, sin mostrar la cantidad', () => {
    const agotado = { ...listing(1), stockQuantity: 0 };
    const conStock = { ...listing(2), stockQuantity: 7 };
    const products = new Map([[agotado.productId, agotado], [conStock.productId, conStock]]);
    const sections = [withItems('s1', 'Sala', [looseProduct('p-1'), looseProduct('p-2')])];
    const screen = render(<CatalogSectionsSummary sections={sections} products={products} categories={EMPTY} />);

    expect(screen.getAllByText('Agotado')).toHaveLength(1);
    expect(screen.getByLabelText('Producto 1, agotado')).toBeTruthy();
    expect(screen.getByLabelText('Producto 2')).toBeTruthy();
    expect(screen.queryByText('7')).toBeNull();
  });
});
