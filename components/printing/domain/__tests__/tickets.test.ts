import {
  clip,
  formatTicketMoney,
  padRow,
  sanitizeSpaces,
  TICKET_WIDTH,
  wrapText,
} from '../ticketLayout';
import { sanitizeForEscPos } from '../escposEncoding';
import { buildPaymentTicket } from '../buildPaymentTicket';
import { buildNegocioTicket } from '../buildNegocioTicket';
import {
  filterDevicesForPlatform,
  iosClassicOnlyHint,
  isUsableOnPlatform,
  looksLikePt210,
  normalizePrinterAddress,
  scanRetryDelayMs,
  scanWatchdogMs,
} from '../printerTransport';
import type { NegocioReceiptData } from '@/lib/negocioReceiptHtml';

const receipt: NegocioReceiptData = {
  receiptNumber: 'RV-2026-001',
  status: 'emitido',
  paidAt: '2026-08-12',
  amount: 150000,
  physicalReceiptNumber: 'F-88',
  negocioNumero: 2026001,
  customerName: 'José Peña Restrepo',
  sellerName: 'Ana Gómez',
  remainingBalance: 850000,
};

describe('ticketLayout 58mm', () => {
  it('usa 32 caracteres por linea', () => {
    expect(TICKET_WIDTH).toBe(32);
  });

  it('alinea etiqueta y valor en una sola linea de 32', () => {
    const row = padRow('Valor recibido', formatTicketMoney(150000));
    expect(row.length).toBe(32);
    expect(row.startsWith('Valor recibido')).toBe(true);
    expect(row.includes('$')).toBe(true);
  });

  it('recorta la izquierda si no cabe junto al valor', () => {
    const row = padRow('Descripcion muy larga de un articulo', '$1.000');
    expect(row.length).toBe(32);
    expect(row.endsWith('$1.000')).toBe(true);
  });

  it('parte textos largos en lineas de 32', () => {
    const lines = wrapText('Cliente: Jose Pena Restrepo de La Plata Huila');
    expect(lines.every((line) => line.length <= 32)).toBe(true);
    expect(lines.join(' ')).toContain('Jose Pena Restrepo');
  });

  it('normaliza espacios no separables del formato COP', () => {
    expect(sanitizeSpaces('$\u00a01.234')).toBe('$ 1.234');
  });

  it('clip agrega puntos suspensivos ASCII', () => {
    expect(clip('ABCDEFGHIJ', 7)).toBe('ABCD...');
  });
});

describe('sanitizeForEscPos', () => {
  it('translitera tildes y n para la PT-210', () => {
    expect(sanitizeForEscPos('José Peña')).toBe('Jose Pena');
    expect(sanitizeForEscPos('¿Cuánto?')).toBe('?Cuanto?');
  });
});

describe('buildPaymentTicket', () => {
  it('incluye los campos del recibo actual', () => {
    const texts = buildPaymentTicket(receipt)
      .filter((line): line is Extract<typeof line, { type: 'text' }> => line.type === 'text')
      .map((line) => line.text)
      .join('\n');

    expect(texts).toContain('CASA IDEAL');
    expect(texts).toContain('RV-2026-001');
    expect(texts).toContain('2026001');
    expect(texts).toContain('José Peña Restrepo');
    expect(texts).toContain('F-88');
    expect(texts).toContain('Valor recibido');
    expect(texts).toContain('Saldo pendiente');
    expect(texts).not.toContain('RECIBO ANULADO');
  });

  it('marca recibos anulados', () => {
    const texts = buildPaymentTicket({ ...receipt, status: 'anulado' })
      .filter((line): line is Extract<typeof line, { type: 'text' }> => line.type === 'text')
      .map((line) => line.text);

    expect(texts).toContain('RECIBO ANULADO');
  });

  it('termina con avance de papel porque la PT-210 no corta', () => {
    const ticket = buildPaymentTicket(receipt);
    expect(ticket[ticket.length - 1]).toEqual({ type: 'spacer', lines: 4 });
  });
});

describe('buildNegocioTicket', () => {
  const negocio = {
    numero: 2026001,
    dealDate: '2026-08-01',
    status: 'activo',
    customerName: 'María López',
    customerIdNumber: '12.345.678',
    sellerName: 'Ana',
    productsSubtotal: 1_000_000,
    interestAmount: 200_000,
    totalCredit: 1_200_000,
    downPayment: 100_000,
    financedAmount: 1_100_000,
    installmentsCount: 12,
    installmentAmount: 91_667,
    frequency: 'mensual',
    items: [
      { quantity: 2, description: 'Colchon doble premium extra largo', subtotal: 800_000 },
      { quantity: 1, description: 'Base', subtotal: 200_000 },
    ],
  };

  it('resume el negocio sin texto legal', () => {
    const texts = buildNegocioTicket(negocio)
      .filter((line): line is Extract<typeof line, { type: 'text' }> => line.type === 'text')
      .map((line) => line.text)
      .join('\n');

    expect(texts).toContain('Ticket de negocio');
    expect(texts).toContain('2026001');
    expect(texts).toContain('María López');
    expect(texts).toContain('2x Colchon');
    expect(texts).toContain('Financiado');
    expect(texts).toContain('12 cuotas mensual');
    expect(texts).toContain('Contrato legal: compartir PDF');
    expect(texts).not.toContain('centrales de riesgo');
  });

  it('muestra sin articulos cuando la lista esta vacia', () => {
    const texts = buildNegocioTicket({ ...negocio, items: [] })
      .filter((line): line is Extract<typeof line, { type: 'text' }> => line.type === 'text')
      .map((line) => line.text);

    expect(texts).toContain('Sin articulos');
  });

  it('no excede 32 caracteres en filas de articulos', () => {
    const itemRows = buildNegocioTicket(negocio)
      .filter((line): line is Extract<typeof line, { type: 'text' }> => line.type === 'text')
      .filter((line) => line.text.includes('x '));

    expect(itemRows.length).toBeGreaterThan(0);
    expect(itemRows.every((line) => line.text.length <= 32)).toBe(true);
  });
});

describe('printerTransport', () => {
  it('reconoce nombres tipicos de la PT-210', () => {
    expect(looksLikePt210('PT-210')).toBe(true);
    expect(looksLikePt210('Goojprt PT210')).toBe(true);
    expect(looksLikePt210('CaysnPrinter')).toBe(true);
    expect(looksLikePt210('RPP02N_C0E9')).toBe(true);
    expect(looksLikePt210('PR-812')).toBe(true);
    expect(looksLikePt210('iPhone')).toBe(false);
  });

  it('antepone ble: a UUID de iOS para no tratarlo como LAN', () => {
    expect(
      normalizePrinterAddress(
        { address: '4E9D74F6-AAAA-BBBB-CCCC-DDDDEEEEFFFF', deviceType: 'ble' },
        'ios'
      )
    ).toBe('ble:4E9D74F6-AAAA-BBBB-CCCC-DDDDEEEEFFFF');
    expect(
      normalizePrinterAddress(
        { address: 'AA:BB:CC:DD:EE:FF', deviceType: 'bt' },
        'android'
      )
    ).toBe('bt:AA:BB:CC:DD:EE:FF');
  });

  it('reintenta el escaneo si la primera pasada vuelve vacia', () => {
    expect(scanRetryDelayMs(0, 0, 3)).toBe(400);
    expect(scanRetryDelayMs(1, 0, 3)).toBeNull();
    expect(scanRetryDelayMs(0, 2, 3)).toBeNull();
  });

  it('limita el primer escaneo de iOS para no quedar colgado', () => {
    expect(scanWatchdogMs('ios', 0)).toBe(4000);
    expect(scanWatchdogMs('ios', 1)).toBe(8000);
    expect(scanWatchdogMs('android', 0)).toBe(15000);
  });

  it('en iOS solo deja BLE o dual', () => {
    const classic = { name: 'PT-210', address: 'bt:AA:BB', deviceType: 'bt' as const };
    const ble = { name: 'PT-210', address: 'ble:AA:BB', deviceType: 'ble' as const };
    expect(isUsableOnPlatform(classic, 'ios')).toBe(false);
    expect(isUsableOnPlatform(ble, 'ios')).toBe(true);
    expect(filterDevicesForPlatform([classic, ble], 'ios')).toEqual([ble]);
    expect(iosClassicOnlyHint([classic], 'ios')).toBe(true);
    expect(iosClassicOnlyHint([classic], 'android')).toBe(false);
  });
});
