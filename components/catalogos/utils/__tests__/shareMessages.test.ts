import { buildShareMessage, buildWhatsAppUrl, shareLinkRecipient } from '../shareMessages';

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

  it('saluda al destinatario solo cuando se proporciona', () => {
    const message = buildShareMessage({
      publicTitle: 'Sala moderna',
      url: 'https://catalogo.test/c/abc123',
      expiresAt: '2026-09-08T12:00:00.000Z',
      label: 'Carlos',
    });
    expect(message).toContain('Hola Carlos.');
  });

  it('no saluda a nadie cuando el nombre está vacío o son solo espacios', () => {
    for (const label of ['', '   ', null, undefined]) {
      const message = buildShareMessage({
        publicTitle: 'Sala moderna',
        url: 'https://catalogo.test/c/abc123',
        expiresAt: '2026-09-08T12:00:00.000Z',
        label,
      });
      expect(message.startsWith('Te comparto el catálogo')).toBe(true);
      expect(message).not.toContain('Hola');
    }
  });
});

describe('shareLinkRecipient', () => {
  it('devuelve el nombre recortado o null si el enlace no tiene destinatario', () => {
    expect(shareLinkRecipient('  Familia Pérez ')).toBe('Familia Pérez');
    expect(shareLinkRecipient('')).toBeNull();
    expect(shareLinkRecipient('   ')).toBeNull();
    expect(shareLinkRecipient(null)).toBeNull();
    expect(shareLinkRecipient(undefined)).toBeNull();
  });
});

describe('buildWhatsAppUrl', () => {
  it('codifica el mensaje para wa.me', () => {
    expect(buildWhatsAppUrl('Hola: https://catalogo.test/c/ab')).toBe('https://wa.me/?text=Hola%3A%20https%3A%2F%2Fcatalogo.test%2Fc%2Fab');
  });
});
