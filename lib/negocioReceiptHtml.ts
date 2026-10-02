import { CASA_IDEAL_LOGO_DATA_URI } from '@/lib/casaIdealLogo';
import { formatCOP } from '@/lib/creditCalculator';
import { COMPANY } from '@/lib/negocioContractHtml';
import { formatNegocioCodigo } from '@/lib/negocioLabels';
import { formatPaymentDateTime } from '@/lib/localDate';
import { isReprint, printCopyDetail, printCopyLabel, type PrintCopyInfo } from '@/lib/printCopy';

export type NegocioReceiptData = {
  receiptNumber: string;
  status: string;
  paidAt: string;
  amount: number;
  physicalReceiptNumber?: string | null;
  negocioNumero: number;
  customerName: string;
  /** Cédula del cliente (`customers.id_number`); sin valor no se imprime la línea. */
  customerIdNumber?: string | null;
  /** Vendedor del negocio (compatibilidad); si no hay `registeredBy` se usa como autor. */
  sellerName?: string | null;
  /** Usuario que registró el pago. */
  registeredBy?: string | null;
  /** Método de pago; los pagos anteriores al catálogo no tienen. */
  paymentMethodName?: string | null;
  /** Sitio de pago ya traducido a etiqueta ("Almacén", "Aplicación Móvil"). */
  paymentSiteName?: string | null;
  remainingBalance: number;
  /** 'abono' | 'pronto_pago'. Sin valor se trata como abono. */
  paymentKind?: string | null;
  /** Descuento por pronto pago. */
  discountAmount?: number | null;
  /** Motivo del descuento (opcional); sin motivo no se muestra la fila. */
  discountReason?: string | null;
  /** Pendiente total que se liquidó; si falta se deriva de `amount + discountAmount`. */
  expectedTotal?: number | null;
  /**
   * El pago se registró sin conexión y sigue en la cola: el recibo sale con la
   * leyenda de pendiente. Al confirmarse el pago, la leyenda desaparece.
   */
  pendingConfirmation?: boolean | null;
  /**
   * Productos del negocio (cantidad, nombre, precio unitario y subtotal). Vacío o sin
   * valor no se imprime la sección: recibos de negocios sin productos cargados.
   */
  products?: NegocioReceiptProduct[] | null;
  /** Número de copia (`register_negocio_print`); desde la n.º 2 sale «COPIA N.º X». */
  copy?: PrintCopyInfo | null;
};

/** Producto del negocio tal como sale en el recibo: cantidad y nombre. */
export type NegocioReceiptProduct = {
  quantity: number;
  name: string;
  /** Precio unitario del ítem (`negocio_items.unit_price`); null si no se conoce. */
  unitPrice?: number | null;
  /** Subtotal del ítem (`negocio_items.subtotal`); null si no se conoce. */
  subtotal?: number | null;
};

/** Desde cuántos productos la lista se compacta (dos tablas, letra menor). */
export const RECEIPT_PRODUCTS_COMPACT_FROM = 5;
/** Desde cuántos productos se aprieta todavía más (tres tablas) para no pasar de una hoja. */
export const RECEIPT_PRODUCTS_DENSE_FROM = 17;

/**
 * Líneas del recibo a partir de los ítems del negocio, con los mismos valores
 * que el contrato: nombre (la descripción del ítem; si falta, el nombre del
 * producto), cantidad, precio unitario y subtotal. Un ítem sin precios (datos
 * viejos del teléfono) queda con `unitPrice`/`subtotal` en null.
 */
export function receiptProductsFromItems(
  items:
    | readonly {
        quantity: number | string | null;
        description?: string | null;
        product?: { name?: string | null } | null;
        unit_price?: number | string | null;
        subtotal?: number | string | null;
      }[]
    | null
    | undefined
): NegocioReceiptProduct[] {
  const money = (value: number | string | null | undefined) => {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  return (items ?? []).map((item) => ({
    quantity: Number(item.quantity) || 0,
    name: String(item.description ?? '').trim() || String(item.product?.name ?? '').trim() || 'Producto',
    unitPrice: money(item.unit_price),
    subtotal: money(item.subtotal),
  }));
}

/** «2», o «1.50» si la cantidad no es entera. */
export function formatReceiptQuantity(quantity: number) {
  const value = Number(quantity) || 0;
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

/** Productos que se imprimen (sin nombre no se cuentan). */
export function receiptProducts(data: Pick<NegocioReceiptData, 'products'>): NegocioReceiptProduct[] {
  return (data.products ?? []).filter((product) => String(product?.name ?? '').trim());
}

/**
 * Los precios salen solo si todos los productos los traen: no se inventan
 * precios ni se suma un total incompleto.
 */
export function receiptProductsHavePrices(products: readonly NegocioReceiptProduct[]) {
  return (
    products.length > 0 &&
    products.every(
      (product) =>
        product.unitPrice !== null && product.unitPrice !== undefined && Number.isFinite(Number(product.unitPrice)) &&
        product.subtotal !== null && product.subtotal !== undefined && Number.isFinite(Number(product.subtotal))
    )
  );
}

/** Total de los productos: suma de los subtotales (como «Valor artículos» del contrato). */
export function receiptProductsTotal(products: readonly NegocioReceiptProduct[]) {
  return Math.round(products.reduce((sum, product) => sum + (Number(product.subtotal) || 0), 0) * 100) / 100;
}

/** Leyenda del recibo de un pago que todavía no confirmó el servidor. */
export const PENDING_CONFIRMATION_RECEIPT_LEGEND = 'PENDIENTE DE CONFIRMACIÓN';

/** Explicación bajo la leyenda, en el mismo lenguaje que se le habla al cliente. */
export const PENDING_CONFIRMATION_RECEIPT_NOTE =
  'Este pago se registró sin señal y se confirmará al sincronizar. Conserve el recibo.';

export function isPendingConfirmationReceipt(
  data: Pick<NegocioReceiptData, 'pendingConfirmation' | 'status'>
) {
  // Un recibo anulado ya tiene su propio aviso; no se mezclan los dos.
  return Boolean(data.pendingConfirmation) && data.status !== 'anulado';
}

/** Pie del recibo y del ticket de un pronto pago vigente (mismo texto que el web). */
export const PRONTO_PAGO_RECEIPT_LEGEND = 'Crédito cancelado por pronto pago.';

export function isProntoPagoReceipt(data: Pick<NegocioReceiptData, 'paymentKind'>) {
  return data.paymentKind === 'pronto_pago';
}

/** Montos del recibo de pronto pago: pendiente liquidado, descuento y dinero recibido. */
export function prontoPagoReceiptAmounts(
  data: Pick<NegocioReceiptData, 'amount' | 'discountAmount' | 'expectedTotal'>
) {
  const amount = Number(data.amount) || 0;
  const discount = Math.max(Number(data.discountAmount) || 0, 0);
  const expected = Number(data.expectedTotal);
  return {
    expectedTotal: Number.isFinite(expected) && data.expectedTotal != null ? expected : amount + discount,
    discount,
    amount,
  };
}

/** Cédula del cliente tal como se guardó, o null si no hay (la línea se omite). */
export function receiptCustomerIdNumber(data: Pick<NegocioReceiptData, 'customerIdNumber'>) {
  const value = String(data.customerIdNumber ?? '').trim();
  return value || null;
}

export function receiptRegisteredBy(data: Pick<NegocioReceiptData, 'registeredBy' | 'sellerName'>) {
  return data.registeredBy || data.sellerName || 'Casa Ideal';
}

const esc = (value: string | null | undefined) => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Estilos del recibo virtual. Deben ser idénticos a los de
 * frontend/src/lib/negocioReceiptHtml.ts (lo verifica un test de paridad en la web).
 * El logo va centrado y a todo el ancho útil, hasta 400 px en pantalla y
 * 70 mm impreso, con el NIT y la dirección pegados debajo (la imagen trae
 * aire transparente abajo: se compensa con margen negativo). La impresión
 * horizontal es solo de la web (WEB_LANDSCAPE_PRINT_CSS): el PDF del iPhone
 * se arma en hoja vertical.
 */
const RECEIPT_CSS = `
@page { size: letter; margin: 14mm; }
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; padding: 24px 16px; background: #eef2f7; font-family: Arial, Helvetica, sans-serif; color: #17243b; font-size: 13px; line-height: 1.4; }
.receipt { position: relative; overflow: hidden; max-width: 620px; margin: 0 auto; background: #fff; border: 1px solid #d5dfeb; border-top: 6px solid #195ba6; border-radius: 12px; padding: 22px 28px 18px; }
.brand { display: flex; flex-direction: column; align-items: center; gap: 0; padding-bottom: 12px; border-bottom: 1px solid #e3eaf3; }
.logo { display: block; width: 100%; max-width: 400px; height: auto; object-fit: contain; }
.company { margin-top: -22px; text-align: center; color: #294c77; font-size: 11px; line-height: 1.45; }
.title { display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; margin: 18px 0 14px; }
.eyebrow { color: #5f6b7a; font-size: 11px; font-weight: 700; letter-spacing: 1.2px; text-transform: uppercase; }
.title h1 { margin: 2px 0 0; color: #173b67; font-size: 22px; letter-spacing: 0.3px; overflow-wrap: anywhere; }
.status { padding: 4px 12px; border-radius: 999px; font-size: 11px; font-weight: 700; letter-spacing: 0.6px; text-transform: uppercase; white-space: nowrap; }
.status-ok { background: #e7f6ec; color: #1d7a3e; border: 1px solid #b9e3c7; }
.status-void { background: #fdecea; color: #b42318; border: 1px solid #f5c2bd; }
.status-pending { background: #fff4e5; color: #9a5b00; border: 1px solid #f3d19e; }
.void-banner { margin: 0 0 14px; padding: 10px 12px; border-radius: 8px; background: #fdecea; color: #b42318; font-weight: 700; text-align: center; }
.copy-banner { margin: 0 0 14px; padding: 8px 12px; border: 1px dashed #a13c2f; border-radius: 8px; color: #a13c2f; font-size: 12px; text-align: center; }
.copy-banner b { letter-spacing: 1px; }
.amount { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 16px 20px; border-radius: 10px; background: #195ba6; background: linear-gradient(135deg, #195ba6, #173b67); color: #fff; }
.amount span { font-size: 12px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; opacity: 0.9; }
.amount strong { font-size: 28px; letter-spacing: 0.3px; white-space: nowrap; }
.is-voided .amount { background: #f3f4f6; color: #6b7280; }
.is-voided .amount strong { text-decoration: line-through; }
.fields { display: grid; grid-template-columns: 1fr 1fr; gap: 0 24px; margin-top: 14px; }
.field { min-width: 0; padding: 9px 0; border-bottom: 1px dashed #d5dfeb; }
.field.wide { grid-column: 1 / -1; }
.field span { display: block; color: #5f6b7a; font-size: 10.5px; font-weight: 700; letter-spacing: 0.6px; text-transform: uppercase; }
.field strong { display: block; margin-top: 2px; color: #17243b; font-size: 13.5px; overflow-wrap: anywhere; }
.products { margin-top: 14px; }
.products-title { display: block; color: #5f6b7a; font-size: 10.5px; font-weight: 700; letter-spacing: 0.6px; text-transform: uppercase; }
.products-parts { display: grid; grid-template-columns: 1fr; align-items: start; gap: 0 24px; margin-top: 4px; }
.products-part { width: 100%; border-collapse: collapse; table-layout: fixed; }
.products-part + .products-part thead { display: none; }
.products-part th { padding: 4px 0; border-bottom: 1px solid #d5dfeb; color: #5f6b7a; font-size: 10px; font-weight: 700; letter-spacing: 0.4px; text-align: left; text-transform: uppercase; }
.products-part td { padding: 4px 0; border-bottom: 1px dashed #d5dfeb; font-size: 13px; vertical-align: top; overflow-wrap: anywhere; }
.products-part .q { width: 12%; color: #173b67; font-weight: 700; text-align: center; }
.products-part .m { width: 22%; padding-left: 6px; text-align: right; white-space: nowrap; }
.products-total { display: flex; justify-content: space-between; gap: 12px; padding-top: 6px; color: #173b67; font-weight: 700; }
.products.is-compact td { padding: 2px 0; font-size: 12px; }
.products.is-dense td { padding: 1px 0; font-size: 11px; }
.products.is-compact .m, .products.is-dense .m { padding-left: 4px; }
.balance { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-top: 16px; padding: 12px 16px; border: 1px solid #d5dfeb; border-radius: 10px; background: #f6f9fd; }
.balance span { color: #294c77; font-weight: 700; }
.balance strong { color: #173b67; font-size: 18px; white-space: nowrap; }
.foot { margin-top: 18px; padding-top: 12px; border-top: 1px solid #e3eaf3; color: #5f6b7a; font-size: 10.5px; line-height: 1.5; text-align: center; }
.watermark { position: absolute; top: 45%; left: 50%; transform: translate(-50%, -50%) rotate(-24deg); color: rgba(180, 35, 24, 0.1); font-size: 96px; font-weight: 800; letter-spacing: 8px; white-space: nowrap; pointer-events: none; }
@media (max-width: 480px) {
  body { padding: 12px 8px; }
  .receipt { padding: 18px 16px 14px; }
  .company { display: none; }
  .fields { grid-template-columns: 1fr; }
  .amount { flex-direction: column; align-items: flex-start; }
}
@media print {
  body { padding: 0; background: #fff; color: #000; font-size: 11px; }
  .receipt { max-width: 95mm; margin: 0 auto; border: 1px solid #000; border-radius: 6px; padding: 10px 12px 8px; }
  .brand { gap: 0; padding-bottom: 6px; border-bottom: 1px solid #000; }
  .logo { max-width: 70mm; filter: grayscale(1); }
  .company { margin-top: -5mm; color: #000; font-size: 8px; }
  .title { margin: 8px 0 6px; }
  .eyebrow { color: #000; font-size: 8px; }
  .title h1 { color: #000; font-size: 14px; }
  .status, .status-ok, .status-void, .status-pending { padding: 1px 6px; background: none; color: #000; border: 1px solid #000; font-size: 8px; }
  .void-banner { margin: 0 0 6px; padding: 3px; background: none; color: #000; border: 1px solid #000; border-radius: 3px; font-size: 9px; }
  .copy-banner { margin: 0 0 6px; padding: 3px; color: #000; border: 1px dashed #000; border-radius: 3px; font-size: 8px; }
  .amount, .is-voided .amount { padding: 6px 0; border-radius: 0; background: none; color: #000; border-top: 1px solid #000; border-bottom: 1px solid #000; }
  .amount span { font-size: 9px; opacity: 1; }
  .amount strong { font-size: 16px; }
  .fields { gap: 0 12px; margin-top: 4px; }
  .field { padding: 3px 0; border-bottom: 1px dotted #999; }
  .field span { color: #333; font-size: 7px; }
  .field strong { color: #000; font-size: 10px; }
  .products { margin-top: 4px; }
  .products-title { color: #333; font-size: 7px; }
  .products-parts { margin-top: 1px; }
  .products-part th { padding: 1px 0; border-bottom: 1px solid #000; color: #333; font-size: 7px; }
  .products-part td { padding: 1px 0; border-bottom: 1px dotted #999; color: #000; font-size: 9px; }
  .products-part .q { color: #000; }
  .products.is-compact td { padding: 0; font-size: 8px; }
  .products.is-dense td { padding: 0; font-size: 7px; }
  .products-total { padding-top: 2px; color: #000; font-size: 9px; }
  .balance { margin-top: 6px; padding: 5px 8px; border: 1px solid #000; border-radius: 3px; background: none; }
  .balance span, .balance strong { color: #000; }
  .balance strong { font-size: 12px; }
  .foot { margin-top: 6px; padding-top: 5px; border-top: 1px solid #000; color: #333; font-size: 7px; }
  .watermark { color: rgba(0, 0, 0, 0.08); font-size: 48px; letter-spacing: 4px; }
}
`;

/**
 * Sección «Productos»: cantidad, producto, precio unitario, subtotal y total.
 * Con muchos productos la lista se parte en tablas (2 o 3) que en pantalla y
 * en hoja vertical van una debajo de otra (letra menor) y en la horizontal de
 * la web lado a lado, para no pasar de una hoja. Sin productos no sale nada.
 */
function receiptProductsHtml(data: Pick<NegocioReceiptData, 'products'>) {
  const list = receiptProducts(data);
  if (list.length === 0) return '';
  const withPrices = receiptProductsHavePrices(list);
  const dense = list.length >= RECEIPT_PRODUCTS_DENSE_FROM;
  const compact = !dense && list.length >= RECEIPT_PRODUCTS_COMPACT_FROM;
  const partCount = dense ? 3 : compact ? 2 : 1;
  const perPart = Math.ceil(list.length / partCount);
  const head = `<thead><tr><th class="q">Cant.</th><th>Producto</th>${
    withPrices ? '<th class="m">Vr. unitario</th><th class="m">Subtotal</th>' : ''
  }</tr></thead>`;
  const row = (product: NegocioReceiptProduct) =>
    `<tr><td class="q">${esc(formatReceiptQuantity(product.quantity))}</td><td>${esc(product.name.trim())}</td>${
      withPrices
        ? `<td class="m">${esc(formatCOP(Number(product.unitPrice)))}</td><td class="m">${esc(formatCOP(Number(product.subtotal)))}</td>`
        : ''
    }</tr>`;
  const parts = Array.from({ length: partCount }, (_, index) => list.slice(index * perPart, (index + 1) * perPart))
    .filter((part) => part.length > 0)
    .map((part) => `<table class="products-part">${head}<tbody>${part.map(row).join('')}</tbody></table>`)
    .join('');
  const total = withPrices
    ? `<div class="products-total"><span>Total productos</span><strong>${esc(formatCOP(receiptProductsTotal(list)))}</strong></div>`
    : '';
  return `<section class="products${dense ? ' is-dense' : compact ? ' is-compact' : ''}"><span class="products-title">Productos (${list.length})</span><div class="products-parts">${parts}</div>${total}</section>
`;
}

const STATUS_STYLES: Record<string, { label: string; tone: string }> = {
  emitido: { label: 'Emitido', tone: 'ok' },
  anulado: { label: 'Anulado', tone: 'void' },
};

function receiptStatus(status: string) {
  const known = STATUS_STYLES[status];
  if (known) return known;
  const text = String(status ?? '').trim();
  if (!text) return STATUS_STYLES.emitido;
  return { label: text.charAt(0).toUpperCase() + text.slice(1), tone: 'pending' };
}

/** `value` ya viene escapado. */
const field = (label: string, value: string, wide = false) =>
  `<div class="field${wide ? ' wide' : ''}"><span>${label}</span><strong>${value}</strong></div>`;

export function buildNegocioReceiptHtml(data: NegocioReceiptData) {
  const isVoided = data.status === 'anulado';
  const status = receiptStatus(data.status);
  const prontoPago = isProntoPagoReceipt(data);
  const pronto = prontoPagoReceiptAmounts(data);
  // Un pronto pago liquida todo el crédito: el saldo que deja siempre es 0.
  const remainingBalance = prontoPago ? 0 : data.remainingBalance;
  const discountReason = String(data.discountReason ?? '').trim();
  // Solo clases existentes (.field, .balance, .foot): RECEIPT_CSS debe seguir
  // idéntico al del web.
  const prontoPagoFields = prontoPago
    ? `
  ${field('Total pendiente', esc(formatCOP(pronto.expectedTotal)))}
  ${field('Descuento pronto pago', esc(formatCOP(pronto.discount)))}${discountReason ? `
  ${field('Motivo del descuento', esc(discountReason), true)}` : ''}`
    : '';
  const customerIdNumber = receiptCustomerIdNumber(data);
  const customerIdField = customerIdNumber ? `
  ${field('C.C.', esc(customerIdNumber), true)}` : '';
  const pendingConfirmation = isPendingConfirmationReceipt(data);
  const copyLabel = printCopyLabel(data.copy);
  // Aviso de pago sin confirmar. Reutiliza `.balance` (recuadro ya existente):
  // RECEIPT_CSS no se toca porque debe seguir idéntico al del web.
  const pendingBanner = pendingConfirmation
    ? `<section class="balance"><span>Estado del recibo</span><strong>${esc(
        PENDING_CONFIRMATION_RECEIPT_LEGEND
      )}</strong></section>`
    : '';
  return `<!doctype html><html lang="es"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Recibo ${esc(data.receiptNumber)}</title><style>${RECEIPT_CSS}</style></head><body>
<main class="receipt${isVoided ? ' is-voided' : ''}">
${isVoided ? '<div class="watermark" aria-hidden="true">ANULADO</div>' : copyLabel ? '<div class="watermark" aria-hidden="true">COPIA</div>' : ''}
<header class="brand">
  <img class="logo" src="${CASA_IDEAL_LOGO_DATA_URI}" alt="${esc(COMPANY.name)} - ${esc(COMPANY.tagline)}" />
  <div class="company"><b>NIT ${esc(COMPANY.nit)}</b><br />${esc(COMPANY.address)}<br />Cel. ${esc(COMPANY.phone)}</div>
</header>
<section class="title">
  <div><div class="eyebrow">Recibo de pago${prontoPago ? ' · Pronto pago' : ''}</div><h1>${esc(data.receiptNumber)}</h1></div>
  <span class="status status-${status.tone}">${esc(status.label)}</span>
</section>
${isVoided ? '<p class="void-banner">RECIBO ANULADO · Este comprobante no es soporte de pago.</p>' : ''}
${isReprint(data.copy) ? `<p class="copy-banner"><b>${esc(copyLabel)}</b> · ${esc(printCopyDetail(data.copy))}</p>` : ''}
${pendingBanner}
<section class="amount"><span>${prontoPago ? 'Total pagado' : 'Valor recibido'}</span><strong>${formatCOP(data.amount)}</strong></section>
<section class="fields">
  ${field('Negocio', esc(formatNegocioCodigo(data.negocioNumero)))}
  ${field('Fecha y hora de pago', esc(formatPaymentDateTime(data.paidAt)))}
  ${field('Cliente', esc(data.customerName), true)}${customerIdField}${prontoPagoFields}
  ${field('Método de pago', esc(data.paymentMethodName) || 'No registrado')}
  ${field('Sitio de pago', esc(data.paymentSiteName) || 'No registrado')}
  ${field('Recibo físico', esc(data.physicalReceiptNumber) || 'No aplica')}
  ${field('Registrado por', esc(receiptRegisteredBy(data)))}
</section>
${receiptProductsHtml(data)}<section class="balance"><span>Saldo pendiente</span><strong>${formatCOP(remainingBalance)}</strong></section>
<footer class="foot">${pendingConfirmation ? `${esc(PENDING_CONFIRMATION_RECEIPT_NOTE)}<br />` : ''}${prontoPago && !isVoided ? `${esc(PRONTO_PAGO_RECEIPT_LEGEND)}<br />` : ''}${esc(COMPANY.name)} · ${esc(COMPANY.tagline)}<br />Comprobante generado por el Sistema de Gestión de Inventario.</footer>
</main></body></html>`;
}
