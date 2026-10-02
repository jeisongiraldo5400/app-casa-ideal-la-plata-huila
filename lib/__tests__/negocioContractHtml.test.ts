import {
  buildNegocioContractHtml,
  CONTRACT_LOGO_HEIGHTS,
  NEGOCIO_CONTRACT_PDF_SIZE,
  type NegocioContractData,
} from '../negocioContractHtml';

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

// Igualado con el PDF de la web (pedido por el usuario, 2026-09-24): el
// contrato dice quién creó el negocio y quién es su vendedor, en ese orden.
describe('creador y vendedor del negocio', () => {
  it('nombra primero a quien lo creó', () => {
    const html = buildNegocioContractHtml({
      ...base,
      seller_name: 'ANDRÉS RAMÍREZ',
      created_by_name: 'TATIANA CHINCHILLA',
    });

    expect(html).toContain('CREADO POR');
    expect(html).toContain('TATIANA CHINCHILLA');
    expect(html).toContain('VENDEDOR (DUEÑO DEL CLIENTE)');
    expect(html).toContain('ANDRÉS RAMÍREZ');
    expect(html.indexOf('CREADO POR')).toBeLessThan(html.indexOf('VENDEDOR (DUEÑO DEL CLIENTE)'));
  });

  it('sin creador conocido (sin señal) deja la raya en vez de repetir al vendedor', () => {
    const html = buildNegocioContractHtml({ ...base, seller_name: 'ANDRÉS RAMÍREZ' });

    expect(html).toContain('CREADO POR');
    expect(html).toContain('ANDRÉS RAMÍREZ');
    const creado = html.indexOf('CREADO POR');
    const vendedor = html.indexOf('VENDEDOR (DUEÑO DEL CLIENTE)');
    expect(html.slice(creado, vendedor)).toContain('—');
  });

  it('el vendedor es el dueño del cliente cuando se conoce', () => {
    const html = buildNegocioContractHtml({
      ...base,
      seller_name: 'ANDRÉS RAMÍREZ',
      customer_seller_name: 'LUISA DUEÑA',
      created_by_name: 'TATIANA CHINCHILLA',
    });
    const vendedor = html.indexOf('VENDEDOR (DUEÑO DEL CLIENTE)');
    expect(html.slice(vendedor, vendedor + 120)).toContain('LUISA DUEÑA');
  });

  it('la firma del vendedor se rotula como del negocio, igual que en la web', () => {
    const html = buildNegocioContractHtml({ ...base, seller_name: 'ANDRÉS RAMÍREZ' });

    expect(html).toContain('Firma del vendedor del negocio');
  });
});

describe('marca de copia', () => {
  const copy = { number: 3, printedAt: '2026-09-30T15:15:00Z', printedBy: 'Brayan' };

  it('el original no lleva marca', () => {
    const html = buildNegocioContractHtml({ ...base, copy: { ...copy, number: 1 } });
    expect(html).not.toContain('class="copy-mark"');
    expect(html).not.toContain('class="copy-watermark"');
  });

  it('la reimpresión lleva COPIA N.º X junto al número, marca de agua y pie', () => {
    const html = buildNegocioContractHtml({ ...base, copy });
    expect(html).toContain('<span class="copy-mark">COPIA N.º 3</span>N.º');
    expect(html).toContain('<div class="copy-watermark" aria-hidden="true">COPIA</div>');
    expect(html).toMatch(/· COPIA N\.º 3: Impresa el 30\/09\/2026 .* por Brayan<\/div>/);
  });
});

describe('logo grande en el encabezado', () => {
  const logoHeight = (html: string) => Number(html.match(/\.logo \{ display: block; height: (\d+)px;/)?.[1]);
  const emptyRows = (html: string) => html.split('<tr class="empty">').length - 1;
  const withItems = (data: NegocioContractData, count: number): NegocioContractData => ({
    ...data,
    items: Array.from({ length: count }, (_, i) => ({ quantity: 1, description: `Artículo ${i + 1}`, unit_price: 1, subtotal: 1 })),
  });

  it('con filas de relleno de sobra sale al doble del anterior (112 px) y cede 2 filas vacías', () => {
    const html = buildNegocioContractHtml(base);
    expect(logoHeight(html)).toBe(CONTRACT_LOGO_HEIGHTS.full);
    expect(CONTRACT_LOGO_HEIGHTS.full).toBe(112);
    // 3 cuotas → 16 filas de artículos: 1 real + 15 de relleno, de las que el logo ocupa 2.
    expect(emptyRows(html)).toBe(13);
  });

  it('con una sola fila de relleno cede esa y sale a 96 px', () => {
    // Nivel compacto con plan a dos columnas: 7 filas, 6 artículos reales.
    const html = buildNegocioContractHtml(withItems(heavy, 6));
    expect(logoHeight(html)).toBe(CONTRACT_LOGO_HEIGHTS.reduced);
    expect(emptyRows(html)).toBe(0);
  });

  it('con la tabla llena de artículos sale a 76 px, sin hacer crecer el encabezado', () => {
    const html = buildNegocioContractHtml(heavy);
    expect(logoHeight(html)).toBe(CONTRACT_LOGO_HEIGHTS.compact);
    expect(CONTRACT_LOGO_HEIGHTS.compact).toBeGreaterThan(56);
    expect(emptyRows(html)).toBe(0);
  });

  it('el título y el número van junto al logo, con los datos de la empresa', () => {
    const html = buildNegocioContractHtml(base);
    expect(html).toMatch(/<header class="brand">\s*<img class="logo"[^>]*>\s*<div class="brand-side">\s*<div class="company">[\s\S]*?<div class="title"><h2>Solicitud de crédito<\/h2>/);
  });
});
