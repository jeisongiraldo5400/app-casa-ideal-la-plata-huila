import { formatCOP } from '@/lib/creditCalculator';
import { formatNegocioCodigo } from '@/lib/negocioLabels';

export type NegocioContractData = {
  numero: number;
  deal_date: string;
  location?: string | null;
  status: string;
  customer_name: string;
  customer_id_number?: string | null;
  customer_phone?: string | null;
  customer_email?: string | null;
  customer_address?: string | null;
  codeudor_name?: string | null;
  codeudor_id_number?: string | null;
  codeudor_phone?: string | null;
  codeudor_email?: string | null;
  codeudor_address?: string | null;
  seller_name?: string | null;
  seller_id_number?: string | null;
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

const CREDIT_TERMS = [
  'El cliente declara haber recibido a su entera satisfacción la mercancía descrita en esta solicitud de crédito y se compromete a cancelar a favor de Rubén Darío Serrato Molina y/o Casa Ideal de La Plata Huila el valor total de la obligación, en las cuotas y fechas aquí indicadas.',
  'El incumplimiento en el pago de las cuotas hace exigible el total de la obligación. En caso de cobro judicial, el comprador se compromete a pagar el saldo adeudado, los intereses moratorios legalmente permitidos y los costos del proceso ejecutivo que correspondan.',
  'El cliente declara que, al aprobarse el crédito y recibir los artículos en su domicilio, conoce el contenido del presente contrato y, al suscribirlo y firmarlo, acepta sus condiciones.',
  'Si el deudor deja de pagar dos cuotas consecutivas, Casa Ideal de La Plata podrá iniciar las actuaciones legalmente procedentes para recuperar los artículos entregados. Cualquier recuperación, imputación de pagos, devolución o terminación se realizará con sujeción al contrato y a la legislación colombiana aplicable.',
  'Casa Ideal de La Plata se reserva el dominio de la mercancía hasta que la obligación haya sido pagada en su totalidad, en los términos permitidos por la legislación aplicable.',
];

const RISK_AUTHORIZATION =
  'Autorizo de manera previa, expresa e informada a Casa Ideal de La Plata, NIT 12.279.584-1, o a quien represente sus derechos, para consultar, reportar, conservar, suministrar, solicitar o divulgar ante operadores de información y centrales de riesgo los datos relacionados con mi comportamiento comercial, financiero y crediticio, positivo o negativo, de acuerdo con la legislación vigente. Declaro que conozco mis derechos de consulta, actualización, rectificación y reclamo. Todo reporte negativo estará sujeto a la comunicación previa y demás requisitos legales.';

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

  const sig = (
    url: string | null | undefined,
    label: string,
    name?: string | null,
    document?: string | null
  ) =>
    url
      ? `<div class="sig"><div class="sig-space"><img src="${esc(url)}" alt="${esc(label)}" /></div><div class="sig-line"></div><b>${esc(label)}</b><small>${esc(name) || '—'}${document ? ` · C.C. ${esc(document)}` : ''}</small></div>`
      : `<div class="sig"><div class="sig-space"></div><div class="sig-line"></div><b>${esc(label)}</b><small>${esc(name) || '—'}${document ? ` · C.C. ${esc(document)}` : ''}</small></div>`;

  const location = esc(data.location) || '—';
  const frequency =
    data.frequency === 'quincenal'
      ? 'quincenales'
      : data.frequency === 'semanal'
        ? 'semanales'
        : 'mensuales';

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>Solicitud de crédito ${formatNegocioCodigo(data.numero)} - Casa Ideal</title>
<style>
  @page { size: A4; margin: 10mm 11mm 12mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, sans-serif; color: #17243b; margin: 0; font-size: 9.5px; line-height: 1.28; }
  .brand { display:grid; grid-template-columns:65px 1fr 210px; gap:12px; align-items:center; border-bottom:3px solid #195ba6; padding-bottom:7px; }
  .mark { width:60px; height:60px; border-radius:50%; background:#195ba6; color:#fff; display:grid; place-items:center; font-size:32px; font-weight:800; }
  h1 { color:#195ba6; font:700 24px Georgia,serif; margin:0; }
  .tag { color:#195ba6; font-size:14px; font-weight:700; }
  .company { text-align:right; color:#294c77; }
  .title { display:flex; justify-content:space-between; color:#195ba6; align-items:center; margin:8px 0 6px; }
  .title h2 { margin:0; font-size:18px; letter-spacing:1px; text-transform:uppercase; }
  .number { color:#a13c2f; font-size:15px; font-weight:800; }
  .meta, .parties, .finance { display:grid; border:1px solid #195ba6; }
  .meta { grid-template-columns:120px 1fr 1fr; margin-bottom:6px; }
  .meta div { padding:4px 6px; border-right:1px solid #195ba6; }
  .meta div:last-child { border:0; }
  .parties { grid-template-columns:1fr 1fr; }
  .party + .party { border-left:1px solid #195ba6; }
  .box-title { background:#eaf2fb; color:#164f91; text-align:center; text-transform:uppercase; font-weight:800; padding:3px; border-bottom:1px solid #195ba6; }
  .field { display:grid; grid-template-columns:76px 1fr; min-height:20px; border-bottom:1px solid #b8cce3; padding:3px 6px; }
  .field:last-child { border:0; }
  .field b { color:#3e5f84; font-size:8.5px; }
  .section { color:#195ba6; font-size:11px; font-weight:800; text-transform:uppercase; margin:8px 0 4px; }
  .terms { margin:5px 0 0; padding-left:19px; text-align:justify; }
  .terms li { margin-bottom:3px; }
  .authorization, .additional { border:1px solid #8aaccf; background:#f6f9fd; padding:6px 8px; text-align:justify; margin-top:6px; }
  .authorization b { display:block; text-align:center; color:#164f91; margin-bottom:3px; }
  table { width:100%; border-collapse:collapse; }
  th,td { border:1px solid #8aaccf; padding:4px 6px; text-align:left; vertical-align:top; }
  th { background:#eaf2fb; color:#164f91; text-transform:uppercase; font-size:8.5px; }
  tr { break-inside:avoid; }
  .r { text-align: right; }
  .finance { grid-template-columns:repeat(4,1fr); margin-top:6px; }
  .finance div { padding:5px 7px; border-right:1px solid #8aaccf; border-bottom:1px solid #8aaccf; }
  .finance div:nth-child(4n) { border-right:0; }
  .finance div:nth-last-child(-n+4) { border-bottom:0; }
  .finance span { display:block; color:#53708f; font-size:8px; text-transform:uppercase; }
  .finance strong { font-size:11px; }
  .sigs { display:grid; grid-template-columns:repeat(3,1fr); gap:16px; margin-top:12px; break-inside:avoid; }
  .sig { text-align:center; }
  .sig-space { height:54px; display:grid; place-items:end center; }
  .sig img { max-width:95%; max-height:52px; object-fit:contain; }
  .sig-line { border-top:1px solid #24364c; }
  .sig b,.sig small { display:block; margin-top:2px; font-size:8.5px; }
  .sig small { color:#53708f; }
  .promissory { margin-top:13px; border:1.5px solid #195ba6; padding:8px; break-inside:avoid; }
  .promissory h3 { color:#195ba6; text-align:center; font-size:13px; margin:0 0 6px; text-transform:uppercase; }
  .line { display:inline-block; border-bottom:1px solid #55789d; min-width:140px; }
  .annex { break-before:page; }
  .footer { position:fixed; bottom:-8mm; left:0; right:0; text-align:center; color:#6b7e94; font-size:7.5px; }
</style>
</head>
<body>
  <div class="footer">Casa Ideal de La Plata · Solicitud ${formatNegocioCodigo(data.numero)} · Documento generado ${new Date().toISOString().slice(0, 10)}</div>
  <header class="brand">
    <div class="mark">⌂</div>
    <div><h1>Casa Ideal de La Plata</h1><div class="tag">Muebles y Electrodomésticos</div></div>
    <div class="company"><b>NIT 12.279.584-1</b><br/>Rubén Darío Serrato Molina<br/>Calle 4 No. 2-18 - La Plata, Huila<br/>Cel. 311 2227014</div>
  </header>
  <div class="title"><h2>Solicitud de crédito</h2><div class="number">N.º ${formatNegocioCodigo(data.numero)}</div></div>
  <div class="meta">
    <div><b>FECHA</b><br/>${esc(data.deal_date)}</div>
    <div><b>LUGAR</b><br/>${location}</div>
    <div><b>VENDEDOR</b><br/>${esc(data.seller_name) || '—'}</div>
  </div>
  <div class="parties">
    <section class="party"><div class="box-title">Comprador</div>
      <div class="field"><b>Nombres</b><span>${esc(data.customer_name) || '—'}</span></div>
      <div class="field"><b>C.C.</b><span>${esc(data.customer_id_number) || '—'}</span></div>
      <div class="field"><b>Dirección</b><span>${esc(data.customer_address) || location}</span></div>
      <div class="field"><b>Celular</b><span>${esc(data.customer_phone) || '—'}</span></div>
      <div class="field"><b>Correo</b><span>${esc(data.customer_email) || '—'}</span></div>
    </section>
    <section class="party"><div class="box-title">Codeudor</div>
      <div class="field"><b>Nombres</b><span>${esc(data.codeudor_name) || 'No aplica'}</span></div>
      <div class="field"><b>C.C.</b><span>${esc(data.codeudor_id_number) || '—'}</span></div>
      <div class="field"><b>Dirección</b><span>${esc(data.codeudor_address) || '—'}</span></div>
      <div class="field"><b>Celular</b><span>${esc(data.codeudor_phone) || '—'}</span></div>
      <div class="field"><b>Correo</b><span>${esc(data.codeudor_email) || '—'}</span></div>
    </section>
  </div>
  <div class="section">Condiciones del crédito</div>
  <ol class="terms">${CREDIT_TERMS.map((term) => `<li>${esc(term)}</li>`).join('')}</ol>
  <div class="authorization"><b>Autorización de consulta y reporte en centrales de riesgo</b>${esc(RISK_AUTHORIZATION)}</div>
  <div class="section">Artículos</div>
  <table>
    <thead><tr><th>Cant.</th><th>Descripción</th><th class="r">Unitario</th><th class="r">Subtotal</th></tr></thead>
    <tbody>${itemsRows || "<tr><td colspan='4'>Sin artículos registrados</td></tr>"}</tbody>
  </table>
  <div class="finance">
    <div><span>Valor artículos</span><strong>${formatCOP(data.products_subtotal)}</strong></div>
    <div><span>Total del crédito</span><strong>${formatCOP(data.total_credit)}</strong></div>
    <div><span>Cuota inicial</span><strong>${formatCOP(data.down_payment)}</strong></div>
    <div><span>Saldo financiado</span><strong>${formatCOP(data.financed_amount)}</strong></div>
    <div><span>Plan de pago</span><strong>${data.installments_count} cuotas ${frequency} de ${formatCOP(data.installment_amount)}</strong></div>
    <div><span>Primera cuota</span><strong>${esc(data.first_due_date) || '—'}</strong></div>
    <div><span>Estado</span><strong>${esc(data.status)}</strong></div>
    <div><span>Orden de entrega</span><strong>${esc(data.delivery_order_number) || 'Pendiente'}</strong></div>
  </div>
  ${data.legal_text ? `<div class="section">Condiciones adicionales</div><div class="additional">${esc(data.legal_text)}</div>` : ''}
  <div class="sigs">
    ${sig(data.customer_signature_url, 'Firma del cliente', data.customer_name, data.customer_id_number)}
    ${sig(data.guarantor_signature_url, 'Firma del fiador', data.codeudor_name, data.codeudor_id_number)}
    ${sig(data.seller_signature_url, 'Firma del vendedor', data.seller_name, data.seller_id_number)}
  </div>
  <section class="promissory">
    <h3>Letra de cambio - por ${formatCOP(data.total_credit)}</h3>
    <p>El comprador y el codeudor, si aplica, se obligan solidariamente a pagar a la orden de Rubén Darío Serrato Molina y/o Casa Ideal de La Plata la suma correspondiente al saldo exigible de esta obligación, de acuerdo con las condiciones pactadas y la legislación colombiana aplicable.</p>
    <p>Fecha: <span class="line">${esc(data.deal_date)}</span> &nbsp; Lugar: <span class="line">${location}</span></p>
  </section>
  <section class="annex">
    <div class="section">Anexo - Plan de cuotas</div>
    <table><thead><tr><th>#</th><th>Vencimiento</th><th class="r">Valor</th><th>Estado</th></tr></thead>
    <tbody>${cuotasRows || "<tr><td colspan='4'>Las cuotas se generarán al activar el negocio.</td></tr>"}</tbody></table>
  </section>
</body>
</html>`;
}
