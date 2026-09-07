import { buildPublicStorageUrl } from '../storageUrl';

const previousUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;

beforeEach(() => {
  process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://catalog.example.supabase.co/';
});

afterEach(() => {
  process.env.EXPO_PUBLIC_SUPABASE_URL = previousUrl;
});

describe('buildPublicStorageUrl', () => {
  it('construye la ruta pública sin importar la barra final de la URL base', () => {
    expect(buildPublicStorageUrl('catalog-images', 'cp-1/portada.jpg')).toBe(
      'https://catalog.example.supabase.co/storage/v1/object/public/catalog-images/cp-1/portada.jpg'
    );
  });

  it('codifica cada segmento sin escapar las barras', () => {
    expect(buildPublicStorageUrl('catalog-images', 'cp 1/foto con espacios.jpg')).toBe(
      'https://catalog.example.supabase.co/storage/v1/object/public/catalog-images/cp%201/foto%20con%20espacios.jpg'
    );
  });

  it('lanza cuando falta la URL de Supabase', () => {
    delete process.env.EXPO_PUBLIC_SUPABASE_URL;
    expect(() => buildPublicStorageUrl('catalog-images', 'a.jpg')).toThrow('EXPO_PUBLIC_SUPABASE_URL');
  });
});
