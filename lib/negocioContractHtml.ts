import { formatCOP } from '@/lib/creditCalculator';

export type NegocioContractData = {
  numero: number;
  deal_date: string;
  location?: string | null;
  status: string;
  customer_name: string;
  customer_id_number?: string | null;
  customer_phone?: string | null;
  customer_address?: string | null;
  codeudor_name?: string | null;
  codeudor_id_number?: string | null;
  seller_name?: string | null;
  products_subtotal: number;
  interest_amount: number;
  total_credit: number;
  down_payment: number;
  financed_amount: number;
  installments_count: number;
  installment_amount: number;
  frequency: string;
  first_due_date?: string | null;
  legal_text?: string | null;
  customer_signature_url?: string | null;
  guarantor_signature_url?: string | null;
  seller_signature_url?: string | null;
  delivery_order_number?: string | null;
  items: Array<{
    quantity: number;
    description: string;
    unit_price: number;
    subtotal: number;
  }>;
  cuotas: Array<{
    installment_number: number;
    due_date: string;
    amount: number;
    paid_amount?: number;
    status: string;
  }>;
};

function esc(s: string | null | undefined) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildNegocioContractHtml(data: NegocioContractData): string {
  const itemsRows = data.items
    .map(
      (i) => `
      <tr>
        <td>${i.quantity}</td>
        <td>${esc(i.description)}</td>
        <td class="r">${formatCOP(i.unit_price)}</td>
        <td class="r">${formatCOP(i.subtotal)}</td>
      </tr>`
    )
    .join('');

  const cuotasRows = data.cuotas
    .map(
      (c) => `
      <tr>
        <td>${c.installment_number}</td>
        <td>${esc(c.due_date)}</td>
        <td class="r">${formatCOP(c.amount)}</td>
        <td>${esc(c.status)}</td>
      </tr>`
    )
    .join('');

  const sig = (url: string | null | undefined, label: string) =>
    url
      ? `<div class="sig"><div class="sig-label">${esc(label)}</div><img src="${esc(url)}" alt="${esc(label)}" /></div>`
      : `<div class="sig"><div class="sig-label">${esc(label)}</div><div class="sig-empty">________________</div></div>`;

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>Negocio #${data.numero} — Casa Ideal</title>
<style>
  body { font-family: Georgia, 'Times New Roman', serif; color: #111; margin: 24px; font-size: 13px; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  h2 { font-size: 15px; margin: 20px 0 8px; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
  .meta { color: #444; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; margin-top: 6px; }
  th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; }
  th { background: #f5f5f5; }
  .r { text-align: right; }
  .totals { margin-top: 12px; }
  .legal { white-space: pre-wrap; font-size: 11px; color: #333; border: 1px solid #ddd; padding: 10px; margin-top: 8px; }
  .sigs { display: flex; flex-wrap: wrap; gap: 16px; margin-top: 16px; }
  .sig { width: 220px; }
  .sig img { max-width: 100%; max-height: 80px; border: 1px solid #ddd; background: #fff; }
  .sig-empty { height: 60px; border-bottom: 1px solid #333; margin-top: 40px; }
  .sig-label { font-size: 11px; color: #555; margin-bottom: 4px; }
</style>
</head>
<body>
  <h1>Casa Ideal — Solicitud de crédito</h1>
  <div class="meta">
    Negocio <strong>#${data.numero}</strong>
    · Fecha ${esc(data.deal_date)}
    · Estado ${esc(data.status)}
    ${data.location ? `· Lugar: ${esc(data.location)}` : ''}
    ${data.delivery_order_number ? `· OE ${esc(data.delivery_order_number)}` : ''}
  </div>
  <h2>Cliente</h2>
  <div><strong>${esc(data.customer_name)}</strong></div>
  <div>Doc: ${esc(data.customer_id_number) || '—'} · Tel: ${esc(data.customer_phone) || '—'}</div>
  <div>${esc(data.customer_address) || ''}</div>
  ${
    data.codeudor_name
      ? `<div style="margin-top:8px"><strong>Codeudor:</strong> ${esc(data.codeudor_name)}</div>`
      : ''
  }
  ${data.seller_name ? `<div style="margin-top:8px"><strong>Vendedor:</strong> ${esc(data.seller_name)}</div>` : ''}
  <h2>Productos</h2>
  <table>
    <thead><tr><th>Cant.</th><th>Descripción</th><th class="r">Unitario</th><th class="r">Subtotal</th></tr></thead>
    <tbody>${itemsRows}</tbody>
  </table>
  <div class="totals">
    <div>Subtotal contado: <strong>${formatCOP(data.products_subtotal)}</strong></div>
    <div>Interés: ${formatCOP(data.interest_amount)}</div>
    <div>Total crédito: <strong>${formatCOP(data.total_credit)}</strong></div>
    <div>Cuota inicial: ${formatCOP(data.down_payment)}</div>
    <div>Financiado: ${formatCOP(data.financed_amount)}</div>
    <div>${data.installments_count} cuotas de <strong>${formatCOP(data.installment_amount)}</strong> (${esc(data.frequency)})</div>
  </div>
  <h2>Plan de cuotas</h2>
  <table>
    <thead><tr><th>#</th><th>Vence</th><th class="r">Valor</th><th>Estado</th></tr></thead>
    <tbody>${cuotasRows || "<tr><td colspan='4'>Sin cuotas</td></tr>"}</tbody>
  </table>
  ${data.legal_text ? `<h2>Condiciones</h2><div class="legal">${esc(data.legal_text)}</div>` : ''}
  <div class="sigs">
    ${sig(data.customer_signature_url, 'Firma del cliente')}
    ${sig(data.guarantor_signature_url, 'Firma del fiador')}
    ${sig(data.seller_signature_url, 'Firma del vendedor')}
  </div>
</body>
</html>`;
}
