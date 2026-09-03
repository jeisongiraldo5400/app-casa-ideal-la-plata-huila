import { formatCOP } from '@/lib/creditCalculator';
import { parseDownPaymentSchedule, type DownPaymentEntry } from '@/lib/negocios/negocioCreditRules';
import { CASA_IDEAL_LOGO_DATA_URI } from '@/lib/casaIdealLogo';
import {
  formatNegocioCodigo,
  labelCuotaNumero,
  labelCuotaStatus,
  labelNegocioStatus,
} from '@/lib/negocioLabels';

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
  /** Fecha de pago acordada de la cuota inicial (cuota 0). */
  down_payment_date?: string | null;
  /** Abonos iniciales pactados; si falta se reconstruye desde down_payment/down_payment_date. */
  down_payment_schedule?: DownPaymentEntry[] | null;
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
  /**
   * Cuotas generadas en la base de datos. Si viene vacío (negocio en borrador)
   * el plan de pagos se proyecta a partir de first_due_date y la frecuencia.
   */
  cuotas?: Array<{
    installment_number: number;
    due_date: string;
    amount: number;
    paid_amount?: number | null;
    status: string;
  }>;
  items: Array<{
    quantity: number;
    description: string;
    unit_price: number;
    subtotal: number;
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

const COMPANY = {
  name: 'Casa Ideal de La Plata',
  tagline: 'Muebles y Electrodomésticos',
  owner: 'Rubén Darío Serrato Molina',
  nit: '12.279.584-1',
  address: 'Calle 4 No. 2-18 - La Plata, Huila',
  phone: '311 2227014',
};

/** Muestra fechas ISO (YYYY-MM-DD) como DD/MM/YYYY; deja intacto cualquier otro formato. */
function fmtDate(value: string | null | undefined): string {
  const s = String(value ?? '').trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s;
}

/** Suma meses a una fecha ISO ajustando el día al fin de mes, igual que `interval '1 month'` en Postgres. */
function addMonthsIso(iso: string, months: number): string {
  const [y, mo, d] = iso.split('-').map(Number);
  const target = new Date(Date.UTC(y, mo - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

function addDaysIso(iso: string, days: number): string {
  const [y, mo, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, mo - 1, d + days)).toISOString().slice(0, 10);
}

type PlanRow = { label: string; due_date: string; amount: number; status: string; paid_amount: number };

/**
 * Plan de pagos a imprimir. Usa las cuotas reales cuando existen; si no,
 * proyecta las fechas con la misma regla que la base de datos
 * (semanal +7 días, quincenal +15 días, mensual +1 mes desde la primera cuota).
 */
function buildPlanRows(data: NegocioContractData): { rows: PlanRow[]; projected: boolean } {
  const cuotas = (data.cuotas || [])
    .filter((c) => c.status !== 'anulada')
    .sort((a, b) => a.installment_number - b.installment_number || a.due_date.localeCompare(b.due_date));
  if (cuotas.length > 0) {
    return {
      projected: false,
      rows: cuotas.map((c) => ({
        label: labelCuotaNumero(c.installment_number),
        due_date: c.due_date,
        amount: Number(c.amount),
        status: c.status,
        paid_amount: Number(c.paid_amount || 0),
      })),
    };
  }
  const rows: PlanRow[] = [];
  for (const abono of parseDownPaymentSchedule(data.down_payment_schedule, data)) {
    rows.push({ label: labelCuotaNumero(0), due_date: abono.due_date, amount: abono.amount, status: 'pendiente', paid_amount: 0 });
  }
  const first = String(data.first_due_date || '').match(/^\d{4}-\d{2}-\d{2}/) ? String(data.first_due_date).slice(0, 10) : null;
  if (first) {
    for (let i = 1; i <= data.installments_count; i += 1) {
      const due =
        data.frequency === 'semanal'
          ? addDaysIso(first, 7 * (i - 1))
          : data.frequency === 'quincenal'
            ? addDaysIso(first, 15 * (i - 1))
            : addMonthsIso(first, i - 1);
      rows.push({ label: labelCuotaNumero(i), due_date: due, amount: data.installment_amount, status: 'pendiente', paid_amount: 0 });
    }
  }
  return { rows, projected: true };
}

/**
 * Tamaño de letra y distribución del contrato. El documento debe caber
 * siempre en una sola hoja oficio, pero un negocio con pocos artículos y sin
 * texto legal adicional tiene mucho más espacio libre que uno con muchos
 * artículos, muchas cuotas y condiciones adicionales largas. En vez de una
 * talla de letra fija (que obligaba a usar ~7pt para el peor caso), se elige
 * uno de estos dos niveles según cuánto contenido tenga el negocio. Los
 * valores fueron validados renderizando el HTML con Chrome headless y
 * comprobando que el PDF resultante siga teniendo 1 sola página, tanto en
 * casos típicos como en el caso más pesado (8 artículos, 24 cuotas, fiador y
 * texto legal adicional). Debe mantenerse igual que en
 * frontend/src/lib/negocioContractHtml.ts.
 */
type ContractSizeTier = {
  body: number; company: number; titleH2: number; number: number; metaB: number; boxTitle: number;
  fieldB: number; section: number; terms: number; authAdd: number; th: number; planNote: number;
  financeSpan: number; financeStrong: number; sigText: number; promissoryH3: number; footer: number;
  /** Filas de artículos en el nivel compacto (plan corto / plan a dos columnas). */
  minItemRows: number; minItemRowsLongPlan: number;
  pageMargin: string;
  /** Alto del área imprimible (330 mm menos márgenes, con 1 mm de holgura). */
  contentHeight: string;
};

/** Nivel usado por la mayoría de negocios (pocos artículos/cuotas o sin texto legal). */
const COMFORTABLE_TIER: ContractSizeTier = {
  body: 11.2, company: 10, titleH2: 16.5, number: 15.3, metaB: 9.4, boxTitle: 10.6,
  fieldB: 9.4, section: 12.4, terms: 10, authAdd: 10, th: 9.4, planNote: 9.4,
  financeSpan: 8.9, financeStrong: 12.4, sigText: 9.4, promissoryH3: 13, footer: 8.9,
  minItemRows: 8, minItemRowsLongPlan: 6, pageMargin: '5mm 8mm 7mm', contentHeight: '317mm',
};

/** Nivel compacto: negocios con muchos artículos, muchas cuotas y/o texto legal largo. */
const COMPACT_TIER: ContractSizeTier = {
  body: 10.2, company: 9.1, titleH2: 15, number: 13.9, metaB: 8.6, boxTitle: 9.6,
  fieldB: 8.6, section: 11.2, terms: 9.1, authAdd: 9.1, th: 8.5, planNote: 8.5,
  financeSpan: 8, financeStrong: 11.2, sigText: 8.5, promissoryH3: 11.8, footer: 8,
  minItemRows: 9, minItemRowsLongPlan: 7, pageMargin: '4mm 6mm 4mm', contentHeight: '321mm',
};

/** Tope de filas de artículos aunque sobre espacio (evita una tabla absurda). */
const MAX_ITEM_ROWS = 16;
/** Mínimo de filas de artículos para que la tabla no se vea vacía. */
const MIN_ITEM_ROWS = 4;

/** Por encima de este puntaje de densidad se usa el nivel compacto. */
const DENSITY_THRESHOLD = 26;

/**
 * A partir de esta cantidad de cuotas el plan de pagos se imprime en dos
 * columnas para no desbordar la hoja oficio.
 */
const PLAN_SPLIT_THRESHOLD = 6;

function pickSizeTier(itemCount: number, planRowCount: number, hasLegalText: boolean): ContractSizeTier {
  const density = itemCount + planRowCount + (hasLegalText ? 6 : 0);
  return density > DENSITY_THRESHOLD ? COMPACT_TIER : COMFORTABLE_TIER;
}

/**
 * Cuántas filas debe tener la tabla de artículos (reales + vacías) para que el
 * contrato ocupe toda la hoja. En el nivel cómodo se calcula a partir del
 * espacio que dejan libre el plan de pagos (alto de la columna más larga) y
 * el texto legal adicional; la recta se ajustó con mediciones en Chrome
 * headless (p. ej. 2 filas de plan → 18 filas caben, 12 → 8 filas) restando
 * una fila de seguridad. El residuo que quede lo absorbe la tabla vía flex
 * (ver CSS de `.items`). En el nivel compacto no sobra espacio, así que se
 * usan las constantes ya validadas. Misma fórmula que en la web.
 */
function itemRowTarget(tier: ContractSizeTier, planRowCount: number, legalText: string | null | undefined): number {
  const split = planRowCount > PLAN_SPLIT_THRESHOLD;
  if (tier === COMPACT_TIER) return split ? tier.minItemRowsLongPlan : tier.minItemRows;
  const legalLength = String(legalText ?? '').trim().length;
  const legalPenalty = legalLength === 0 ? 0 : 2 + Math.floor(legalLength / 250);
  // Plan a dos columnas: filas más bajas (padding 1px) → pendiente menor.
  const rows = split
    ? Math.floor(19.8 - 1.33 * Math.ceil(planRowCount / 2) - legalPenalty)
    : Math.floor(20.5 - 1.5 * planRowCount - legalPenalty);
  return Math.min(MAX_ITEM_ROWS, Math.max(MIN_ITEM_ROWS, rows));
}

export function buildNegocioContractHtml(data: NegocioContractData): string {
  const itemsRows = data.items
    .map(
      (i) => `
      <tr>
        <td class="c">${i.quantity}</td>
        <td>${esc(i.description)}</td>
        <td class="r">${formatCOP(i.unit_price)}</td>
        <td class="r">${formatCOP(i.subtotal)}</td>
      </tr>`
    )
    .join('');
  const plan = buildPlanRows(data);
  const tier = pickSizeTier(data.items.length, plan.rows.length, Boolean(data.legal_text));
  const minItemRows = itemRowTarget(tier, plan.rows.length, data.legal_text);
  const emptyRows = Array.from(
    { length: Math.max(0, minItemRows - data.items.length) },
    () => `<tr class="empty"><td>&nbsp;</td><td></td><td></td><td></td></tr>`
  ).join('');
  const planRowHtml = (r: (typeof plan.rows)[number]) => `
      <tr class="${r.status === 'pagada' ? 'paid' : ''}">
        <td class="c">${esc(r.label)}</td>
        <td class="c">${fmtDate(r.due_date)}</td>
        <td class="r">${formatCOP(r.amount)}</td>
        <td class="c">${plan.projected ? '' : esc(labelCuotaStatus(r.status))}</td>
      </tr>`;
  const planTable = (rows: typeof plan.rows) =>
    `<table class="plan-table"><thead><tr><th class="c" style="width:44px">Cuota</th><th class="c">Fecha de pago</th><th class="r">Valor</th><th class="c" style="width:56px">Estado</th></tr></thead><tbody>${rows.map(planRowHtml).join('')}</tbody></table>`;
  // Con muchas cuotas el plan se reparte en dos columnas para que el contrato
  // completo siga cabiendo en una sola hoja oficio.
  const planHtml =
    plan.rows.length === 0
      ? ''
      : plan.rows.length > PLAN_SPLIT_THRESHOLD
        ? `<div class="plan-grid">${planTable(plan.rows.slice(0, Math.ceil(plan.rows.length / 2)))}${planTable(plan.rows.slice(Math.ceil(plan.rows.length / 2)))}</div>`
        : planTable(plan.rows);

  const sig = (
    url: string | null | undefined,
    label: string,
    name?: string | null,
    document?: string | null
  ) =>
    url
      ? `<div class="sig"><div class="sig-space"><img src="${esc(url)}" alt="${esc(label)}" /></div><div class="sig-line"></div><b>${esc(label)}</b><small>${esc(name) || '—'}${document ? ` · C.C. ${esc(document)}` : ''}</small></div>`
      : `<div class="sig"><div class="sig-space"></div><div class="sig-line"></div><b>${esc(label)}</b><small>${esc(name) || '—'}${document ? ` · C.C. ${esc(document)}` : ''}</small></div>`;

  const formattedDate = esc(fmtDate(data.deal_date));
  const location = esc(data.location) || '—';
  const firstDueDate = esc(fmtDate(data.first_due_date)) || '—';
  const downPaymentSchedule = parseDownPaymentSchedule(data.down_payment_schedule, data);
  const downPaymentLabel =
    downPaymentSchedule.length === 1
      ? `${formatCOP(data.down_payment)} · paga el ${esc(fmtDate(downPaymentSchedule[0].due_date))}`
      : downPaymentSchedule.length > 1
        ? `${formatCOP(data.down_payment)} en ${downPaymentSchedule.length} abonos: ${downPaymentSchedule
            .map((abono) => `${formatCOP(abono.amount)} el ${esc(fmtDate(abono.due_date))}`)
            .join(', ')}`
        : formatCOP(data.down_payment);
  const frequencyLabel =
    data.frequency === 'quincenal'
      ? 'quincenales'
      : data.frequency === 'semanal'
        ? 'semanales'
        : 'mensuales';
  const planLabel =
    data.installments_count > 0
      ? `${data.installments_count} cuotas ${frequencyLabel} de ${formatCOP(data.installment_amount)}`
      : 'Sin cuotas: pagado con abonos iniciales';

  // Hoja tamaño oficio (216 x 330 mm; no confundir con legal, 216 x 356 mm).
  // La tipografía se elige según `tier` (ver pickSizeTier) para que el
  // contrato completo siempre quepa en una sola página. Mismo tamaño que
  // PAGE_SIZE_CSS en la web y que el PDF generado en app/negocio/[id].tsx
  // (612 x 935 puntos).
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>Solicitud de crédito ${formatNegocioCodigo(data.numero)} - Casa Ideal</title>
<style>
  @page { size: 216mm 330mm; margin: ${tier.pageMargin}; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  /* El cuerpo mide exactamente el área imprimible y la tabla de artículos (flex: 1)
     absorbe el espacio sobrante para que el documento ocupe toda la hoja. */
  body { font-family: Arial, Helvetica, sans-serif; color: #17243b; font-size: ${tier.body}px; line-height: 1.22; padding-bottom: 12px; height: ${tier.contentHeight}; display: flex; flex-direction: column; }
  .items { flex: 1; display: flex; flex-direction: column; min-height: 0; }
  .items table { flex: 1; }
  .brand { display: grid; grid-template-columns: 1fr 190px; gap: 8px; align-items: center; border-bottom: 2px solid #195ba6; padding-bottom: 4px; }
  .logo { display: block; height: 50px; width: auto; max-width: 100%; object-fit: contain; }
  .company { text-align: right; color: #294c77; font-size: ${tier.company}px; line-height: 1.3; }
  .title { display: flex; justify-content: space-between; align-items: center; color: #195ba6; margin: 4px 0 3px; }
  .title h2 { margin: 0; font-size: ${tier.titleH2}px; letter-spacing: 1px; text-transform: uppercase; }
  .number { color: #a13c2f; font-size: ${tier.number}px; font-weight: 800; }
  .meta, .parties, .finance { display: grid; border: 1px solid #195ba6; }
  .meta { grid-template-columns: 100px 1fr 1fr; margin-bottom: 4px; }
  .meta div { padding: 3px 5px; border-right: 1px solid #195ba6; }
  .meta div:last-child { border-right: 0; }
  .meta b { color: #3e5f84; font-size: ${tier.metaB}px; }
  .parties { grid-template-columns: 1fr 1fr; }
  .party { min-width: 0; }
  .party + .party { border-left: 1px solid #195ba6; }
  .box-title { background: #eaf2fb; color: #164f91; font-size: ${tier.boxTitle}px; text-align: center; text-transform: uppercase; font-weight: 800; padding: 1px 3px; border-bottom: 1px solid #195ba6; }
  .field { display: grid; grid-template-columns: 58px 1fr; min-height: 13px; border-bottom: 1px solid #b8cce3; padding: 1px 4px; }
  .field:last-child { border-bottom: 0; }
  .field b { color: #3e5f84; font-size: ${tier.fieldB}px; }
  .section { color: #195ba6; font-size: ${tier.section}px; font-weight: 800; text-transform: uppercase; margin: 4px 0 2px; }
  .terms { margin: 2px 0 0; padding-left: 13px; text-align: justify; font-size: ${tier.terms}px; }
  .terms li { margin-bottom: 1px; }
  .authorization, .additional { border: 1px solid #8aaccf; background: #f6f9fd; padding: 3px 6px; text-align: justify; margin-top: 3px; font-size: ${tier.authAdd}px; }
  .additional { white-space: pre-wrap; }
  .authorization b { display: block; text-align: center; color: #164f91; margin-bottom: 1px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #8aaccf; padding: 2px 4px; text-align: left; vertical-align: top; line-height: 1.2; }
  tbody td { height: 13px; }
  th { background: #eaf2fb; color: #164f91; text-transform: uppercase; font-size: ${tier.th}px; }
  tr { break-inside: avoid; }
  .r { text-align: right; white-space: nowrap; }
  .c { text-align: center; }
  .plan-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; align-items: start; }
  .plan-table th, .plan-table td { padding: 1px 4px; }
  .plan-table tbody td { height: auto; line-height: 1.15; }
  .plan-table tr.paid td { color: #6b7e94; background: #f3f7fb; }
  .plan-table tr.paid td:first-child::before { content: "✓ "; color: #2e7d32; }
  .plan-note { color: #53708f; font-size: ${tier.planNote}px; margin-top: 2px; }
  .finance { grid-template-columns: repeat(4, 1fr); margin-top: 4px; }
  .finance div { padding: 3px 5px; border-right: 1px solid #8aaccf; border-bottom: 1px solid #8aaccf; }
  .finance div:nth-child(4n) { border-right: 0; }
  .finance div:nth-last-child(-n+4) { border-bottom: 0; }
  .finance span { display: block; color: #53708f; font-size: ${tier.financeSpan}px; text-transform: uppercase; }
  .finance strong { font-size: ${tier.financeStrong}px; }
  .sigs { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 6px; break-inside: avoid; }
  .sig { text-align: center; min-width: 0; }
  .sig-space { height: 36px; display: grid; place-items: end center; }
  .sig img { max-width: 95%; max-height: 40px; object-fit: contain; }
  .sig-line { border-top: 1px solid #24364c; }
  .sig b, .sig small { display: block; margin-top: 1px; font-size: ${tier.sigText}px; }
  .sig small { color: #53708f; }
  .promissory { margin-top: 6px; border: 1px solid #195ba6; padding: 4px 8px; break-inside: avoid; }
  .promissory h3 { color: #195ba6; text-align: center; font-size: ${tier.promissoryH3}px; margin: 0 0 3px; text-transform: uppercase; }
  .promissory p { margin: 2px 0; text-align: justify; }
  .line { display: inline-block; border-bottom: 1px solid #55789d; min-width: 110px; height: 10px; vertical-align: bottom; }
  .footer { position: fixed; bottom: 0; left: 0; right: 0; text-align: center; color: #6b7e94; font-size: ${tier.footer}px; }
</style>
</head>
<body>
  <div class="footer">${COMPANY.name} · Solicitud ${formatNegocioCodigo(data.numero)} · Documento generado ${new Date().toISOString().slice(0, 10)}</div>
  <header class="brand">
    <img class="logo" src="${CASA_IDEAL_LOGO_DATA_URI}" alt="${COMPANY.name} - ${COMPANY.tagline}" />
    <div class="company"><b>NIT ${COMPANY.nit}</b><br/>${COMPANY.owner}<br/>${COMPANY.address}<br/>Cel. ${COMPANY.phone}</div>
  </header>
  <div class="title"><h2>Solicitud de crédito</h2><div class="number">N.º ${formatNegocioCodigo(data.numero)}</div></div>
  <div class="meta">
    <div><b>FECHA</b><br/>${formattedDate}</div>
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
  <div class="items"><table>
    <thead><tr><th class="c" style="width:36px">Cant.</th><th>Descripción</th><th class="r" style="width:90px">Unitario</th><th class="r" style="width:90px">Subtotal</th></tr></thead>
    <tbody>${itemsRows}${emptyRows}</tbody>
  </table></div>
  <div class="finance">
    <div><span>Valor artículos</span><strong>${formatCOP(data.products_subtotal)}</strong></div>
    <div><span>Total del crédito</span><strong>${formatCOP(data.total_credit)}</strong></div>
    <div><span>Abonos iniciales</span><strong>${downPaymentLabel}</strong></div>
    <div><span>Saldo financiado</span><strong>${formatCOP(data.financed_amount)}</strong></div>
    <div><span>Plan de pago</span><strong>${planLabel}</strong></div>
    <div><span>Primera cuota</span><strong>${firstDueDate}</strong></div>
    <div><span>Estado</span><strong>${esc(labelNegocioStatus(data.status))}</strong></div>
    <div><span>Orden de entrega</span><strong>${esc(data.delivery_order_number) || 'Pendiente'}</strong></div>
  </div>
  ${data.legal_text ? `<div class="section">Condiciones adicionales</div><div class="additional">${esc(data.legal_text)}</div>` : ''}
  <div class="section">Plan de pagos${plan.projected ? ` (proyectado)` : ''}</div>
  ${planHtml || `<div class="plan-note">Las fechas de pago se definirán al activar el negocio.</div>`}
  ${plan.projected && planHtml ? `<div class="plan-note">Fechas proyectadas a partir de la primera cuota; se confirman al activar el negocio.</div>` : ''}
  <div class="sigs">
    ${sig(data.customer_signature_url, 'Firma del cliente', data.customer_name, data.customer_id_number)}
    ${sig(data.guarantor_signature_url, 'Firma del fiador', data.codeudor_name, data.codeudor_id_number)}
    ${sig(data.seller_signature_url, 'Firma del vendedor', data.seller_name, data.seller_id_number)}
  </div>
  <section class="promissory">
    <h3>Letra de cambio - por ${formatCOP(data.total_credit)}</h3>
    <p>El comprador y el codeudor, si aplica, se obligan solidariamente a pagar a la orden de ${COMPANY.owner} y/o ${COMPANY.name} la suma correspondiente al saldo exigible de esta obligación, de acuerdo con las condiciones pactadas y la legislación colombiana aplicable.</p>
    <p>Fecha: <span class="line">${formattedDate}</span> &nbsp; Lugar: <span class="line">${location}</span> &nbsp; Deudor: <span class="line">${esc(data.customer_name)}</span> &nbsp; C.C.: <span class="line">${esc(data.customer_id_number)}</span></p>
  </section>
</body>
</html>`;
}
