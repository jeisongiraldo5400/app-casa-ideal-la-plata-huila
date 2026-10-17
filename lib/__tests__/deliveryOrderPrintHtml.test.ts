import {
  buildDeliveryOrderPrintHtml,
  clientSheetBlocks,
  deliveryOrderPrintFileLabel,
  parseDeliveryOrderPrintData,
} from '@/lib/deliveryOrderPrintHtml';
import { sanitizePdfFileName } from '@/lib/sharing/sharePdf';

const line = (over: Record<string, unknown> = {}) => ({
  product_name: 'Lavadora LG 17 kg',
  sku: 'LAV-17',
  warehouse_name: 'BODEGA CENTRO',
  quantity: 2,
  delivered_quantity: 1,
  returned_quantity: 1,
  pending_quantity: 0,
  notes: 'Color blanco',
  serials: ['SN-A'],
  ...over,
});

const order = (over: Record<string, unknown> = {}) => ({
  id: 'o1',
  order_number: 'OE-2026-1234',
  order_type: 'customer',
  status: 'approved',
  created_at: '2026-10-10T14:00:00Z',
  notes: 'Entregar en la tarde',
  created_by_name: 'Ana',
  pickup_names: ['Pedro'],
  remission: null,
  customer: { name: 'María Pérez', id_number: '1080', phone: '300', phone_secondary: '301', address: 'Finca', vereda: 'El Carmen', municipio: 'La Plata' },
  negocios: [{ numero: 20260076, visible: true, status: 'activo', seller_name: 'Ana', deal_date: '2026-10-09' }],
  serials_visible: true,
  items: [line(), line({ product_name: 'Nevera', sku: null, quantity: 3, delivered_quantity: 1, returned_quantity: 0, pending_quantity: 2, notes: null, serials: [] })],
  children: [],
  generated_at: '2026-10-16T15:00:00Z',
  ...over,
});

describe('documento de orden de entrega (móvil)', () => {
  it('trae las cantidades, notas, seriales, totales y firmas, sin precios', () => {
    const html = buildDeliveryOrderPrintHtml(parseDeliveryOrderPrintData(order()));
    expect(html).toContain('size: letter');
    expect(html).toContain('<h1>OE-2026-1234</h1>');
    expect(html).toContain('300 · 301');
    expect(html).toContain('Nota: Color blanco');
    expect(html).toContain('Seriales: SN-A');
    expect(html).toContain('Total (2 productos)</td><td class="n">5</td><td class="n">2</td><td class="n">1</td><td class="n pend">2</td>');
    for (const label of ['Entregó', 'Transportador', 'Recibí conforme']) expect(html).toContain(`<b>${label}</b>`);
    expect(html.toLowerCase()).not.toContain('precio');
  });

  it('marca COPIA N.º X en la reimpresión y ANULADA si la orden está anulada', () => {
    const copy = buildDeliveryOrderPrintHtml(parseDeliveryOrderPrintData(order()), {
      copy: { number: 2, printedAt: '2026-10-16T15:00:00Z', printedBy: 'Luis' },
    });
    expect(copy).toContain('COPIA N.º 2');
    const cancelled = buildDeliveryOrderPrintHtml(parseDeliveryOrderPrintData(order({ status: 'cancelled' })));
    expect(cancelled).toContain('aria-hidden="true">ANULADA<');
  });

  it('remisión: hoja por cliente sin las anuladas y nombre de archivo seguro', () => {
    const data = parseDeliveryOrderPrintData(
      order({
        id: 'r1',
        order_number: 'OE-2026-0071',
        order_type: 'remission',
        customer: null,
        items: [],
        children: [order(), order({ id: 'o2', order_number: 'OE-2026-0072', status: 'cancelled' })],
      })
    );
    expect(clientSheetBlocks(data)).toHaveLength(1);
    const sheets = buildDeliveryOrderPrintHtml(data, { layout: 'hoja_cliente' });
    expect(sheets.match(/<main class="sheet/g)).toHaveLength(1);
    expect(sanitizePdfFileName(deliveryOrderPrintFileLabel(data, 'hoja_cliente'))).toBe('Remision OE-2026-0071 - hojas por cliente.pdf');
    expect(sanitizePdfFileName(deliveryOrderPrintFileLabel(parseDeliveryOrderPrintData(order())))).toBe(
      'Orden de entrega OE-2026-1234 - Maria Perez.pdf'
    );
  });
});
