import { buildNegocioContractHtml, NEGOCIO_CONTRACT_PDF_SIZE, type NegocioContractData } from '../negocioContractHtml';
import { buildNegocioReceiptHtml } from '../negocioReceiptHtml';
import { LETTER_PDF_SIZE, pageMarginsPt, pdfPrintOptions } from '../pdfPrintOptions';

const MM = 72 / 25.4;

const contract: NegocioContractData = {
  numero: 2026021,
  deal_date: '2026-09-10',
  location: 'La Plata, Huila',
  status: 'activo',
  customer_name: 'Cliente de prueba',
  products_subtotal: 1_500_000,
  interest_amount: 0,
  total_credit: 1_500_000,
  down_payment: 0,
  financed_amount: 1_500_000,
  installments_count: 3,
  installment_amount: 500_000,
  frequency: 'mensual',
  first_due_date: '2026-10-10',
  items: [{ quantity: 1, description: 'Nevera', unit_price: 1_500_000, subtotal: 1_500_000 }],
};

const heavy: NegocioContractData = {
  ...contract,
  installments_count: 24,
  installment_amount: 62_500,
  frequency: 'quincenal',
  legal_text: 'Condición adicional. '.repeat(40),
  items: Array.from({ length: 8 }, (_, i) => ({
    quantity: 1,
    description: `Artículo ${i + 1}`,
    unit_price: 187_500,
    subtotal: 187_500,
  })),
};

describe('pdfPrintOptions', () => {
  it('en Android deja el documento igual y solo fija el tamaño de la hoja', () => {
    const html = buildNegocioContractHtml(contract);
    expect(pdfPrintOptions(html, NEGOCIO_CONTRACT_PDF_SIZE, 'android')).toEqual({ html, width: 612, height: 935 });
  });

  it('en iPhone pasa los márgenes de @page en puntos y usa la escala de Chrome', () => {
    const options = pdfPrintOptions(buildNegocioContractHtml(contract), NEGOCIO_CONTRACT_PDF_SIZE, 'ios');
    expect(options.width).toBe(612);
    expect(options.height).toBe(935);
    expect(options.html).toContain('<style>html { zoom: 0.75; }</style></head>');
    expect(options.margins!.top).toBeCloseTo(5 * MM);
    expect(options.margins!.right).toBeCloseTo(8 * MM);
    expect(options.margins!.bottom).toBeCloseTo(7 * MM);
    expect(options.margins!.left).toBeCloseTo(8 * MM);
  });

  it('en iPhone el contrato cabe en una sola hoja oficio (también el caso pesado)', () => {
    for (const data of [contract, heavy]) {
      const html = buildNegocioContractHtml(data);
      const { margins, height } = pdfPrintOptions(html, NEGOCIO_CONTRACT_PDF_SIZE, 'ios');
      const bodyHeightMm = Number(html.match(/body \{[^}]*height: ([\d.]+)mm;/)?.[1]);
      expect(bodyHeightMm * MM).toBeLessThanOrEqual(height - margins!.top - margins!.bottom);
    }
  });

  it('el recibo en iPhone usa hoja carta con los márgenes de su @page', () => {
    const html = buildNegocioReceiptHtml({
      receiptNumber: 'RV-1',
      status: 'emitido',
      paidAt: '2026-09-11T15:42:00.000Z',
      amount: 1,
      negocioNumero: 1,
      customerName: 'Cliente',
      remainingBalance: 0,
    });
    const options = pdfPrintOptions(html, LETTER_PDF_SIZE, 'ios');
    expect(options.height).toBe(792);
    expect(options.margins!.top).toBeCloseTo(14 * MM);
    expect(options.margins!.left).toBeCloseTo(14 * MM);
  });

  it('interpreta márgenes de 1, 2 y 4 valores y sin @page devuelve 0', () => {
    expect(pageMarginsPt('<style>@page { margin: 10mm; }</style>')).toEqual({
      top: 10 * MM, right: 10 * MM, bottom: 10 * MM, left: 10 * MM,
    });
    expect(pageMarginsPt('<style>@page { size: letter; margin: 36pt 72pt; }</style>')).toEqual({
      top: 36, right: 72, bottom: 36, left: 72,
    });
    expect(pageMarginsPt('<style>@page { margin: 1pt 2pt 3pt 4pt; }</style>')).toEqual({
      top: 1, right: 2, bottom: 3, left: 4,
    });
    expect(pageMarginsPt('<p>sin estilos</p>')).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
  });
});
