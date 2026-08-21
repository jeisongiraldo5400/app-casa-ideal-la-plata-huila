import { formatCOP } from '@/lib/creditCalculator';
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
  sellerName?: string | null;
  remainingBalance: number;
};

const esc = (value: string | null | undefined) => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function buildNegocioReceiptHtml(data: NegocioReceiptData) {
  const isVoided = data.status === 'anulado';
  return `<!doctype html><html lang="es"><head><meta charset="utf-8" /><title>Recibo ${esc(data.receiptNumber)}</title><style>body{font-family:Arial,sans-serif;color:#152238;margin:28px;max-width:640px}h1{margin:0;color:#173b67}.meta{color:#5f6b7a}.card{border:1px solid #ccd6e0;padding:20px;margin-top:18px;border-radius:8px}.row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #e5eaf0}.total{font-size:20px;font-weight:bold}.void{color:#b42318;font-weight:bold;font-size:20px}</style></head><body><h1>Casa Ideal</h1><div class="meta">Recibo virtual ${esc(data.receiptNumber)}</div>${isVoided ? '<p class="void">RECIBO ANULADO</p>' : ''}<div class="card"><div class="row"><span>Negocio</span><strong>${esc(formatNegocioCodigo(data.negocioNumero))}</strong></div><div class="row"><span>Cliente</span><strong>${esc(data.customerName)}</strong></div><div class="row"><span>Fecha y hora de pago</span><strong>${esc(formatPaymentDateTime(data.paidAt))}</strong></div><div class="row"><span>Recibo físico</span><strong>${esc(data.physicalReceiptNumber) || 'No aplica'}</strong></div><div class="row"><span>Registrado por</span><strong>${esc(data.sellerName) || 'Casa Ideal'}</strong></div><div class="row total"><span>Valor recibido</span><strong>${formatCOP(data.amount)}</strong></div><div class="row"><span>Saldo pendiente</span><strong>${formatCOP(data.remainingBalance)}</strong></div></div><p class="meta">Comprobante generado por el Sistema de Gestión de Inventario.</p></body></html>`;
}
