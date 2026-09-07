import { buildShareMessage, buildWhatsAppUrl } from '../shareMessages';

describe('buildShareMessage', () => {
  it('incluye la URL dentro del mensaje (Android ignora el campo `url` de Share)', () => {
    const message = buildShareMessage({
      publicTitle: 'Lavadoras Casa Ideal',
      url: 'https://catalogo.test/c/abc123',
      expiresAt: '2026-09-08T12:00:00.000Z',
    });
    expect(message).toContain('https://catalogo.test/c/abc123');
    expect(message).toContain('Lavadoras Casa Ideal');
    expect(message).toContain('Disponible hasta el');
  });
});

describe('buildWhatsAppUrl', () => {
  it('codifica el mensaje para wa.me', () => {
    expect(buildWhatsAppUrl('Hola: https://catalogo.test/c/ab')).toBe('https://wa.me/?text=Hola%3A%20https%3A%2F%2Fcatalogo.test%2Fc%2Fab');
  });
});
