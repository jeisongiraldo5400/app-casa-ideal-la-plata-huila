import { productGalleryUrls } from '../gallery';
import type { PublicCatalogMediaItem } from '../publicCatalogTypes';

function media(overrides: Partial<PublicCatalogMediaItem>): PublicCatalogMediaItem {
  return {
    id: overrides.id ?? 'm',
    type: 'IMAGE',
    bucket: 'catalog-images',
    storagePath: 'p.jpg',
    thumbnailPath: null,
    posterPath: null,
    title: null,
    altText: null,
    isCover: false,
    sortOrder: 0,
    metadata: {},
    publicUrl: 'https://x/p.jpg',
    ...overrides,
  };
}

describe('productGalleryUrls', () => {
  it('pone la portada primero y ordena el resto', () => {
    const urls = productGalleryUrls(
      [
        media({ id: 'b', sortOrder: 2, publicUrl: 'https://x/b.jpg' }),
        media({ id: 'a', sortOrder: 1, publicUrl: 'https://x/a.jpg' }),
        media({ id: 'c', sortOrder: 5, isCover: true, publicUrl: 'https://x/c.jpg' }),
      ],
      null
    );
    expect(urls).toEqual(['https://x/c.jpg', 'https://x/a.jpg', 'https://x/b.jpg']);
  });

  it('descarta videos, 360°, imágenes sin URL y duplicados', () => {
    const urls = productGalleryUrls(
      [
        media({ id: 'v', type: 'VIDEO', publicUrl: 'https://x/v.mp4' }),
        media({ id: 'r', type: 'IMAGE_360', publicUrl: null }),
        media({ id: 'n', publicUrl: null }),
        media({ id: 'a', publicUrl: 'https://x/a.jpg' }),
        media({ id: 'a2', publicUrl: 'https://x/a.jpg' }),
      ],
      null
    );
    expect(urls).toEqual(['https://x/a.jpg']);
  });

  it('sin fotos usa la portada de la lista, y sin nada queda vacío', () => {
    expect(productGalleryUrls([], 'https://x/cover.jpg')).toEqual(['https://x/cover.jpg']);
    expect(productGalleryUrls(null, 'https://x/cover.jpg')).toEqual(['https://x/cover.jpg']);
    expect(productGalleryUrls(undefined, null)).toEqual([]);
  });
});
