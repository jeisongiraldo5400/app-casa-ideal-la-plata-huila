import {
  buildNegocioWhatsAppMessage,
  buildReceiptWhatsAppMessage,
  buildWhatsAppChatAppUrl,
  greetingName,
  nextPendingCuota,
  pickCustomerWhatsApp,
  toCustomerWhatsAppNumber,
} from '../negocioWhatsApp';

describe('toCustomerWhatsAppNumber', () => {
  it.each([
    ['3001234567', '573001234567'],
    ['300 123-4567', '573001234567'],
    ['(300) 123 45 67', '573001234567'],
    ['+57 300 123 4567', '573001234567'],
    ['57 3001234567', '573001234567'],
    ['0057 300 123 4567', '573001234567'],
    ['  310.555.0101  ', '573105550101'],
  ])('celular colombiano %p → %p', (raw, expected) => {
    expect(toCustomerWhatsAppNumber(raw)).toBe(expected);
  });

  it.each([
    [null],
    [undefined],
    [''],
    ['   '],
    ['6011234567'], // fijo de Bogotá con el prefijo nuevo
    ['4441234'], // fijo de 7 dígitos
    ['+57 601 123 4567'],
    ['300123456'], // le falta un dígito
    ['30012345678'], // le sobra uno
    ['sin teléfono'],
  ])('sin WhatsApp: %p', (raw) => {
    expect(toCustomerWhatsAppNumber(raw)).toBeNull();
  });

  it('acepta otro país solo si viene con + o 00', () => {
    expect(toCustomerWhatsAppNumber('+1 (305) 555-0101')).toBe('13055550101');
    expect(toCustomerWhatsAppNumber('0034 612 345 678')).toBe('34612345678');
    expect(toCustomerWhatsAppNumber('13055550101')).toBeNull();
  });
});

describe('pickCustomerWhatsApp', () => {
  it('usa el teléfono 1 si sirve', () => {
    expect(pickCustomerWhatsApp('300 111 2222', '310 555 0101')).toEqual({
      number: '573001112222',
      phone: '300 111 2222',
    });
  });

  it('cae al teléfono 2 si el 1 es fijo o vacío', () => {
    expect(pickCustomerWhatsApp('601 234 5678', '310 555 0101')).toEqual({
      number: '573105550101',
      phone: '310 555 0101',
    });
    expect(pickCustomerWhatsApp(null, ' 3105550101 ')).toEqual({ number: '573105550101', phone: '3105550101' });
  });

  it('null si ninguno sirve', () => {
    expect(pickCustomerWhatsApp(null, null)).toBeNull();
    expect(pickCustomerWhatsApp('4441234', '')).toBeNull();
  });
});

describe('buildWhatsAppChatAppUrl', () => {
  it('abre el chat del número con el texto codificado', () => {
    expect(buildWhatsAppChatAppUrl('573001234567', 'Hola Ana.\nSaldo')).toBe(
      'whatsapp://send?phone=573001234567&text=Hola%20Ana.%0ASaldo'
    );
  });

  it('codifica el texto con encodeURIComponent', () => {
    const message = 'Recibo #12 & saldo?';
    expect(buildWhatsAppChatAppUrl('573001234567', message)).toBe(
      `whatsapp://send?phone=573001234567&text=${encodeURIComponent(message)}`
    );
  });
});

describe('greetingName', () => {
  it('toma el primer nombre con mayúscula inicial', () => {
    expect(greetingName('MARÍA JOSÉ PÉREZ')).toBe('María');
    expect(greetingName('  ana gómez ')).toBe('Ana');
  });

  it('vacío para «Cliente» o sin nombre', () => {
    expect(greetingName('Cliente')).toBe('');
    expect(greetingName(null)).toBe('');
  });
});

describe('nextPendingCuota', () => {
  it('primera cuota con saldo por fecha, sin anuladas ni pagadas', () => {
    expect(
      nextPendingCuota([
        { due_date: '2026-12-01', amount: 100000, paid_amount: 0 },
        { due_date: '2026-10-01', amount: 100000, paid_amount: 100000 },
        { due_date: '2026-10-15', amount: 100000, paid_amount: 0, status: 'anulada' },
        { due_date: '2026-11-01', amount: 100000, paid_amount: 40000 },
      ])
    ).toEqual({ dueDate: '2026-11-01', amount: 60000 });
  });

  it('null sin cuotas pendientes', () => {
    expect(nextPendingCuota([{ due_date: '2026-10-01', amount: 5, paid_amount: 5 }])).toBeNull();
    expect(nextPendingCuota(null)).toBeNull();
  });
});

describe('mensajes', () => {
  it('resumen del contrato con saldo y próxima cuota', () => {
    const message = buildNegocioWhatsAppMessage({
      numero: 20260007,
      customerName: 'ANA GÓMEZ',
      totalCredit: 1200000,
      pendingBalance: 800000,
      nextCuota: { dueDate: '2026-11-01', amount: 100000 },
    });
    expect(message).toContain('Hola Ana.');
    expect(message).toContain('negocio N.º 20260007');
    expect(message).toContain('Saldo pendiente:');
    expect(message).toContain('el 01/11/2026');
  });

  it('sin próxima cuota cuando ya no debe', () => {
    const message = buildNegocioWhatsAppMessage({
      numero: 20260007,
      customerName: 'Ana',
      totalCredit: 1000,
      pendingBalance: 0,
      nextCuota: { dueDate: '2026-11-01', amount: 100 },
    });
    expect(message).not.toContain('Próxima cuota');
  });

  it('recibo con número, abono y aviso de pendiente', () => {
    const message = buildReceiptWhatsAppMessage({
      customerName: 'Ana',
      receiptNumber: 'RV-000123',
      negocioNumero: 20260007,
      amount: 50000,
      paidAt: '2026-10-02',
      remainingBalance: 750000,
      pendingConfirmation: true,
    });
    expect(message).toContain('el recibo RV-000123 de su negocio N.º 20260007');
    expect(message).toContain('(02/10/2026)');
    expect(message).toContain('Pago pendiente de confirmar.');
  });
});
