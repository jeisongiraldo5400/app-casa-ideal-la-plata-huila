import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { PublicCatalogListingItem } from '@/lib/catalogos/publicCatalogTypes';
import type { CatalogSection } from '@/lib/catalogos/types';
import { useProductPicker } from '../useProductPicker';

const mockToggle = jest.fn();
const mockInvalidate = jest.fn();

jest.mock('../../services/catalogItemsService', () => ({ toggleCatalogProduct: (...args: unknown[]) => mockToggle(...args) }));
jest.mock('../../services/catalogsService', () => ({ getPrivateCatalog: jest.fn() }));
jest.mock('../../services/publicCatalogService', () => ({
  listPublicCatalogCategories: jest.fn(async () => []),
  listPublicCatalogProducts: jest.fn(async () => ({ items: [], totalCount: 0 })),
}));
jest.mock('../../store/catalogosStore', () => ({ invalidateCatalogCache: (...args: unknown[]) => mockInvalidate(...args) }));

const SECTIONS: CatalogSection[] = [{ id: 's-1', title: 'Productos', kicker: null, body: null, imageUrl: null, sortOrder: 0, items: [] }];
const ITEM = { productId: 'p-1', catalogProductId: 'cp-1' } as PublicCatalogListingItem;

describe('useProductPicker.toggle', () => {
  it('invalida la caché al empezar la escritura y otra vez al terminar', async () => {
    let finish: () => void = () => undefined;
    mockToggle.mockImplementationOnce(() => new Promise<void>((resolve) => (finish = resolve)));
    const { result } = renderHook(() => useProductPicker('cat-1', SECTIONS));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = result.current.toggle(ITEM);
    });

    // Con la escritura en curso, el Detalle no puede tomar la caché por fresca.
    expect(mockInvalidate).toHaveBeenCalledTimes(1);
    expect(mockInvalidate).toHaveBeenCalledWith('cat-1');
    expect(result.current.selected.has('p-1')).toBe(true);

    await waitFor(() => expect(mockToggle).toHaveBeenCalled());
    expect(mockInvalidate).toHaveBeenCalledTimes(1);
    await act(async () => {
      finish();
      await pending;
    });
    expect(mockInvalidate).toHaveBeenCalledTimes(2);
    expect(result.current.pendingIds.size).toBe(0);
  });
});
