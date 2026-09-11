import { buildNegocioContractHtml, NEGOCIO_CONTRACT_PDF_SIZE, type NegocioContractData } from '../negocioContractHtml';

const base: NegocioContractData = {
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
  ...base,
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

function pageRule(html: string) {
  const m = html.match(/@page \{ size: ([^;]+); margin: ([^;]+); \}/);
  if (!m) throw new Error('El contrato no tiene regla @page');
  return { size: m[1], margin: m[2] };
}

describe('contrato del negocio: tamaño del PDF (referencia para la web)', () => {
  it('genera el PDF en hoja oficio de 612 x 935 puntos', () => {
    expect(NEGOCIO_CONTRACT_PDF_SIZE).toEqual({ width: 612, height: 935 });
  });

  it('declara hoja oficio en @page con los márgenes de cada nivel', () => {
    expect(pageRule(buildNegocioContractHtml(base))).toEqual({ size: '216mm 330mm', margin: '5mm 8mm 7mm' });
    expect(pageRule(buildNegocioContractHtml(heavy))).toEqual({ size: '216mm 330mm', margin: '4mm 6mm 4mm' });
  });

  it('el alto del contenido más los márgenes cabe en la hoja de 935 pt', () => {
    const pageHeightMm = (NEGOCIO_CONTRACT_PDF_SIZE.height * 25.4) / 72;
    for (const data of [base, heavy]) {
      const html = buildNegocioContractHtml(data);
      const [top, , bottom] = pageRule(html).margin.split(' ').map((v) => parseFloat(v));
      const bodyHeight = Number(html.match(/body \{[^}]*height: ([\d.]+)mm;/)?.[1]);
      expect(bodyHeight + top + bottom).toBeLessThanOrEqual(pageHeightMm);
    }
  });
});
