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
};

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
  body { padding: 0; background: #fff; }
  .receipt { max-width: none; border-radius: 0; }
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
  <div><div class="eyebrow">Recibo de pago</div><h1>${esc(data.receiptNumber)}</h1></div>
  <span class="status status-${status.tone}">${esc(status.label)}</span>
</section>
${isVoided ? '<p class="void-banner">RECIBO ANULADO · Este comprobante no es soporte de pago.</p>' : ''}
<section class="amount"><span>Valor recibido</span><strong>${formatCOP(data.amount)}</strong></section>
<section class="fields">
  ${field('Negocio', esc(formatNegocioCodigo(data.negocioNumero)))}
  ${field('Fecha y hora de pago', esc(formatPaymentDateTime(data.paidAt)))}
  ${field('Cliente', esc(data.customerName), true)}
  ${field('Método de pago', esc(data.paymentMethodName) || 'No registrado')}
  ${field('Sitio de pago', esc(data.paymentSiteName) || 'No registrado')}
  ${field('Recibo físico', esc(data.physicalReceiptNumber) || 'No aplica')}
  ${field('Registrado por', esc(receiptRegisteredBy(data)))}
</section>
<section class="balance"><span>Saldo pendiente</span><strong>${formatCOP(data.remainingBalance)}</strong></section>
<footer class="foot">${esc(COMPANY.name)} · ${esc(COMPANY.tagline)}<br />Comprobante generado por el Sistema de Gestión de Inventario.</footer>
</main></body></html>`;
}
