import { CASA_IDEAL_LOGO_DATA_URI } from '@/lib/casaIdealLogo';
import { formatCOP } from '@/lib/creditCalculator';
import { COMPANY } from '@/lib/negocioContractHtml';
import { formatNegocioCodigo } from '@/lib/negocioLabels';
import { formatPaymentDateTime } from '@/lib/localDate';

export type NegocioReceiptData = {
  receiptNumber: string;
  status: string;
  paidAt: string;
  amount: number;
  physicalReceiptNumber?: string | null;
  negocioNumero: number;
  customerName: string;
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
};

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

export function receiptRegisteredBy(data: Pick<NegocioReceiptData, 'registeredBy' | 'sellerName'>) {
  return data.registeredBy || data.sellerName || 'Casa Ideal';
}

const esc = (value: string | null | undefined) => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Estilos del recibo virtual. Deben ser idénticos a los de
 * frontend/src/lib/negocioReceiptHtml.ts (lo verifica un test de paridad en la web).
 */
const RECEIPT_CSS = `
@page { size: letter; margin: 14mm; }
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; padding: 24px 16px; background: #eef2f7; font-family: Arial, Helvetica, sans-serif; color: #17243b; font-size: 13px; line-height: 1.4; }
.receipt { position: relative; overflow: hidden; max-width: 620px; margin: 0 auto; background: #fff; border: 1px solid #d5dfeb; border-top: 6px solid #195ba6; border-radius: 12px; padding: 22px 28px 18px; }
.brand { display: flex; justify-content: space-between; align-items: center; gap: 16px; padding-bottom: 14px; border-bottom: 1px solid #e3eaf3; }
.logo { display: block; height: 52px; width: auto; max-width: 60%; object-fit: contain; }
.company { text-align: right; color: #294c77; font-size: 11px; line-height: 1.45; }
.title { display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; margin: 18px 0 14px; }
.eyebrow { color: #5f6b7a; font-size: 11px; font-weight: 700; letter-spacing: 1.2px; text-transform: uppercase; }
.title h1 { margin: 2px 0 0; color: #173b67; font-size: 22px; letter-spacing: 0.3px; overflow-wrap: anywhere; }
.status { padding: 4px 12px; border-radius: 999px; font-size: 11px; font-weight: 700; letter-spacing: 0.6px; text-transform: uppercase; white-space: nowrap; }
.status-ok { background: #e7f6ec; color: #1d7a3e; border: 1px solid #b9e3c7; }
.status-void { background: #fdecea; color: #b42318; border: 1px solid #f5c2bd; }
.status-pending { background: #fff4e5; color: #9a5b00; border: 1px solid #f3d19e; }
.void-banner { margin: 0 0 14px; padding: 10px 12px; border-radius: 8px; background: #fdecea; color: #b42318; font-weight: 700; text-align: center; }
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
  .brand { padding-bottom: 6px; border-bottom: 1px solid #000; }
  .logo { height: 30px; filter: grayscale(1); }
  .company { color: #000; font-size: 8px; }
  .title { margin: 8px 0 6px; }
  .eyebrow { color: #000; font-size: 8px; }
  .title h1 { color: #000; font-size: 14px; }
  .status, .status-ok, .status-void, .status-pending { padding: 1px 6px; background: none; color: #000; border: 1px solid #000; font-size: 8px; }
  .void-banner { margin: 0 0 6px; padding: 3px; background: none; color: #000; border: 1px solid #000; border-radius: 3px; font-size: 9px; }
  .amount, .is-voided .amount { padding: 6px 0; border-radius: 0; background: none; color: #000; border-top: 1px solid #000; border-bottom: 1px solid #000; }
  .amount span { font-size: 9px; opacity: 1; }
  .amount strong { font-size: 16px; }
  .fields { gap: 0 12px; margin-top: 4px; }
  .field { padding: 3px 0; border-bottom: 1px dotted #999; }
  .field span { color: #333; font-size: 7px; }
  .field strong { color: #000; font-size: 10px; }
  .balance { margin-top: 6px; padding: 5px 8px; border: 1px solid #000; border-radius: 3px; background: none; }
  .balance span, .balance strong { color: #000; }
  .balance strong { font-size: 12px; }
  .foot { margin-top: 6px; padding-top: 5px; border-top: 1px solid #000; color: #333; font-size: 7px; }
  .watermark { color: rgba(0, 0, 0, 0.08); font-size: 48px; letter-spacing: 4px; }
}
`;

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
  const pendingConfirmation = isPendingConfirmationReceipt(data);
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
${isVoided ? '<div class="watermark" aria-hidden="true">ANULADO</div>' : ''}
<header class="brand">
  <img class="logo" src="${CASA_IDEAL_LOGO_DATA_URI}" alt="${esc(COMPANY.name)} - ${esc(COMPANY.tagline)}" />
  <div class="company"><b>NIT ${esc(COMPANY.nit)}</b><br />${esc(COMPANY.address)}<br />Cel. ${esc(COMPANY.phone)}</div>
</header>
<section class="title">
  <div><div class="eyebrow">Recibo de pago${prontoPago ? ' · Pronto pago' : ''}</div><h1>${esc(data.receiptNumber)}</h1></div>
  <span class="status status-${status.tone}">${esc(status.label)}</span>
</section>
${isVoided ? '<p class="void-banner">RECIBO ANULADO · Este comprobante no es soporte de pago.</p>' : ''}
${pendingBanner}
<section class="amount"><span>${prontoPago ? 'Total pagado' : 'Valor recibido'}</span><strong>${formatCOP(data.amount)}</strong></section>
<section class="fields">
  ${field('Negocio', esc(formatNegocioCodigo(data.negocioNumero)))}
  ${field('Fecha y hora de pago', esc(formatPaymentDateTime(data.paidAt)))}
  ${field('Cliente', esc(data.customerName), true)}${prontoPagoFields}
  ${field('Método de pago', esc(data.paymentMethodName) || 'No registrado')}
  ${field('Sitio de pago', esc(data.paymentSiteName) || 'No registrado')}
  ${field('Recibo físico', esc(data.physicalReceiptNumber) || 'No aplica')}
  ${field('Registrado por', esc(receiptRegisteredBy(data)))}
</section>
<section class="balance"><span>Saldo pendiente</span><strong>${formatCOP(remainingBalance)}</strong></section>
<footer class="foot">${pendingConfirmation ? `${esc(PENDING_CONFIRMATION_RECEIPT_NOTE)}<br />` : ''}${prontoPago && !isVoided ? `${esc(PRONTO_PAGO_RECEIPT_LEGEND)}<br />` : ''}${esc(COMPANY.name)} · ${esc(COMPANY.tagline)}<br />Comprobante generado por el Sistema de Gestión de Inventario.</footer>
</main></body></html>`;
}
