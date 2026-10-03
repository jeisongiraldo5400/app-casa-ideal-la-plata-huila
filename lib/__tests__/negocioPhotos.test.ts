import {
  NegocioPhotoUploadError,
  negocioPhotoEntries,
  negocioPhotoFields,
  negocioPhotoKindForField,
  negocioPhotoKindForRole,
  negocioPhotoPath,
  uploadNegocioPhoto,
  validateNegocioPhoto,
} from '../negocioPhotos';

const mockUpload = jest.fn();
jest.mock('@/lib/supabase', () => ({
  supabase: { storage: { from: (bucket: string) => ({ upload: (...args: unknown[]) => mockUpload(bucket, ...args) }) } },
}));

describe('negocioPhotos', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(4) })) as unknown as typeof fetch;
  });

  it('la ruta queda en la carpeta del usuario con la extensión del tipo', () => {
    expect(negocioPhotoPath('u1', { id: 'abc', mimeType: 'image/jpeg' })).toBe('u1/abc.jpg');
    expect(negocioPhotoPath('u1', { id: 'abc', mimeType: 'image/webp' })).toBe('u1/abc.webp');
    expect(() => negocioPhotoPath('', { id: 'abc', mimeType: 'image/jpeg' })).toThrow();
  });

  it('valida tipo y tamaño', () => {
    expect(validateNegocioPhoto({ mimeType: 'image/heic', size: 10 })).toMatch(/JPG, PNG o WebP/);
    expect(validateNegocioPhoto({ mimeType: 'image/jpeg', size: 6 * 1024 * 1024 })).toMatch(/5 MB/);
    expect(validateNegocioPhoto({ mimeType: 'image/jpeg', size: null })).toBeNull();
  });

  it('sin fotos no añade campos al negocio', () => {
    expect(negocioPhotoFields({})).toEqual({});
    expect(negocioPhotoFields({ cedula: 'u1/b.jpg' })).toEqual({ customer_id_photo_path: 'u1/b.jpg' });
  });

  it('la cédula por atrás va en customer_id_back_photo_path, después del frente', () => {
    expect(negocioPhotoFields({ cliente: 'u1/a.jpg', cedula: 'u1/b.jpg', cedula_atras: 'u1/c.jpg' })).toEqual({
      customer_photo_path: 'u1/a.jpg',
      customer_id_photo_path: 'u1/b.jpg',
      customer_id_back_photo_path: 'u1/c.jpg',
    });
    const draft = { id: 'x', uri: 'file:///x.jpg', mimeType: 'image/jpeg', size: 1 };
    expect(negocioPhotoEntries({ cedula_atras: draft, cliente: draft }).map((entry) => entry.kind)).toEqual([
      'cliente',
      'cedula_atras',
    ]);
    expect(negocioPhotoKindForRole('foto_cedula_atras')).toBe('cedula_atras');
    expect(negocioPhotoKindForRole('cliente')).toBeNull();
    expect(negocioPhotoKindForField('customer_id_back_photo_path')).toBe('cedula_atras');
  });

  it('sube sin upsert a negocios-fotos', async () => {
    mockUpload.mockResolvedValue({ error: null });
    await expect(uploadNegocioPhoto('file:///a.jpg', { path: 'u1/a.jpg', mimeType: 'image/jpg' })).resolves.toBe('u1/a.jpg');
    expect(mockUpload).toHaveBeenCalledWith('negocios-fotos', 'u1/a.jpg', expect.any(Uint8Array), {
      contentType: 'image/jpeg',
      upsert: false,
      cacheControl: '3600',
    });
  });

  it('un error 5xx o sin código no es definitivo', async () => {
    mockUpload.mockResolvedValue({ error: { statusCode: '503', message: 'Service Unavailable' } });
    await expect(
      uploadNegocioPhoto('file:///a.jpg', { path: 'u1/a.jpg', mimeType: 'image/jpeg' })
    ).rejects.toMatchObject({ definitive: false });
  });

  it('«ya existe» cuenta como subida (reintento tras perder la respuesta)', async () => {
    mockUpload.mockResolvedValue({ error: { statusCode: '409', message: 'The resource already exists' } });
    await expect(uploadNegocioPhoto('file:///a.jpg', { path: 'u1/a.jpg', mimeType: 'image/jpeg' })).resolves.toBe('u1/a.jpg');
  });

  it('otro error se dice con el nombre de la foto', async () => {
    mockUpload.mockResolvedValue({ error: { statusCode: '403', message: 'new row violates row-level security policy' } });
    const promise = uploadNegocioPhoto('file:///a.jpg', { path: 'u1/a.jpg', mimeType: 'image/jpeg', kind: 'cedula' });
    await expect(promise).rejects.toBeInstanceOf(NegocioPhotoUploadError);
    await expect(promise).rejects.toMatchObject({ definitive: true });
    await expect(promise).rejects.toThrow('No se pudo subir la foto de la cédula (frente): new row violates row-level security policy');
  });
});
