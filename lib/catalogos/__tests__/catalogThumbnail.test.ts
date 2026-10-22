import { catalogThumbnailUrl, needsProductThumbnail } from '../catalogThumbnail';

describe('catalogThumbnailUrl', () => {
  it('la portada propia manda', () => {
    expect(catalogThumbnailUrl({ coverImageUrl: 'https://x/portada.jpg', firstProductImageUrl: 'https://x/nevera.jpg' })).toBe(
      'https://x/portada.jpg'
    );
  });

  it('sin portada usa la foto del primer producto', () => {
    expect(catalogThumbnailUrl({ coverImageUrl: null, firstProductImageUrl: 'https://x/nevera.jpg' })).toBe('https://x/nevera.jpg');
    expect(catalogThumbnailUrl({ coverImageUrl: '  ', firstProductImageUrl: 'https://x/nevera.jpg' })).toBe('https://x/nevera.jpg');
  });

  it('sin ninguna de las dos queda el ícono (null)', () => {
    expect(catalogThumbnailUrl({ coverImageUrl: null, firstProductImageUrl: null })).toBeNull();
    expect(catalogThumbnailUrl({ coverImageUrl: null })).toBeNull();
    expect(catalogThumbnailUrl({ coverImageUrl: '', firstProductImageUrl: '' })).toBeNull();
  });
});

describe('needsProductThumbnail', () => {
  const base = { coverImageUrl: null, isOwner: true, visibility: 'private', status: 'draft' } as const;

  it('lo propio sin portada sí la pide', () => {
    expect(needsProductThumbnail(base)).toBe(true);
  });

  it('con portada no hace falta', () => {
    expect(needsProductThumbnail({ ...base, coverImageUrl: 'https://x/portada.jpg' })).toBe(false);
  });

  it('lo global ajeno publicado sí; lo privado ajeno (que no se dibuja) no', () => {
    expect(needsProductThumbnail({ ...base, isOwner: false, visibility: 'organization', status: 'published' })).toBe(true);
    expect(needsProductThumbnail({ ...base, isOwner: false, visibility: 'private', status: 'published' })).toBe(false);
    expect(needsProductThumbnail({ ...base, isOwner: false, visibility: 'organization', status: 'draft' })).toBe(false);
  });
});
